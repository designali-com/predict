import { withReadableUrls } from "@workspace/storage";
import { db } from "@workspace/db/client";
import {
  account as accountTable,
  patientRecord,
  patientAddress,
  report,
  session as sessionTable,
  user as userTable,
} from "@workspace/db/schema";
import { and, count, desc, eq, ilike, inArray } from "@workspace/db";

export interface UserWithDetails {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  banned: boolean;
  banReason?: string;
  accounts: string[];
  lastSignIn: Date | null;
  createdAt: Date;
  avatarUrl: string;
  role?: string;
}

export interface GetUsersOptions {
  limit?: number;
  offset?: number;
  role?: string;
  /**
   * Several roles at once — what the Team page asks for when no single role is
   * picked. Filtering has to happen in the query rather than on the page: the
   * page holds fifty rows, so a client-side filter would silently hide anyone
   * past the first fifty.
   */
  roles?: string[];
  status?: string;
  email?: string;
  name?: string;
}

export async function getUsers(
  options: GetUsersOptions = {},
): Promise<{ users: UserWithDetails[]; total: number }> {
  const normalizedRole = options.role?.toLowerCase();
  const isPatientAlias = normalizedRole === "patient";

  const conditions = [];

  if (isPatientAlias) {
    conditions.push(inArray(userTable.role, ["user", "patient"]));
  } else if (options.role) {
    conditions.push(eq(userTable.role, options.role));
  } else if (options.roles?.length) {
    conditions.push(inArray(userTable.role, options.roles));
  }

  if (options.status) {
    conditions.push(eq(userTable.banned, options.status === "banned"));
  }

  if (options.name) {
    conditions.push(ilike(userTable.name, `%${options.name}%`));
  }

  if (options.email) {
    conditions.push(ilike(userTable.email, `%${options.email}%`));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;

  const [rows, countResult, accountsQuery, sessionsQuery] = await Promise.all([
    db.query.user.findMany({
      where,
      orderBy: [desc(userTable.createdAt)],
      limit,
      offset,
    }),
    db.select({ value: count() }).from(userTable).where(where),
    db.query.account.findMany({
      columns: { userId: true, providerId: true },
    }),
    db.query.session.findMany({
      columns: { userId: true, createdAt: true },
      orderBy: (session) => [session.createdAt],
    }),
  ]);

  const total = countResult[0]?.value ?? 0;

  // Group accounts by user ID
  const accountsByUser = accountsQuery.reduce(
    (acc, account) => {
      (acc[account.userId] ??= []).push(account.providerId);
      return acc;
    },
    {} as Record<string, string[]>,
  );

  // Get last sign in date by user ID
  const lastSignInByUser = sessionsQuery.reduce(
    (acc, session) => {
      const existingDate = acc[session.userId];
      if (!existingDate || session.createdAt > existingDate) {
        acc[session.userId] = session.createdAt;
      }
      return acc;
    },
    {} as Record<string, Date>,
  );

  const users: UserWithDetails[] = rows.map((user) => {
    const normalizedUserRole = (user.role ?? "").toLowerCase();

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      verified: user.emailVerified,
      role: normalizedUserRole === "user" ? "patient" : (user.role ?? undefined),
      banned: user.banned ?? false,
      banReason: user.banReason || "",
      accounts: accountsByUser[user.id] || [],
      lastSignIn: lastSignInByUser[user.id] || null,
      createdAt: user.createdAt,
      avatarUrl: user.image || "",
    };
  });

  return { users, total };
}

export interface UserDetails extends UserWithDetails {
  patientCode: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  mobileNumber: string | null;
  bloodGroup: string | null;
  alternateMobile: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  reports: {
    id: string;
    fileUrl: string;
    fileName: string | null;
    reportType: string | null;
    uploadedAt: Date;
  }[];
}

export async function getUserById(id: string): Promise<UserDetails | null> {
  const [userRow, accounts, lastSession, patientRow, reports] = await Promise.all([
    db.query.user.findFirst({ where: eq(userTable.id, id) }),
    db.query.account.findMany({
      where: eq(accountTable.userId, id),
      columns: { providerId: true },
    }),
    db.query.session.findFirst({
      where: eq(sessionTable.userId, id),
      orderBy: [desc(sessionTable.createdAt)],
    }),
    db.query.patientRecord.findFirst({ where: eq(patientRecord.userId, id) }),
    db.query.report.findMany({
      where: eq(report.userId, id),
      orderBy: [desc(report.uploadedAt)],
    }),
  ]);

  if (!userRow) return null;

  const addressRow = patientRow
    ? await db.query.patientAddress.findFirst({
        where: and(eq(patientAddress.patientId, patientRow.id), eq(patientAddress.addressType, "home")),
      })
    : null;

  const normalizedRole = (userRow.role ?? "").toLowerCase();

  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    verified: userRow.emailVerified,
    role: normalizedRole === "user" ? "patient" : userRow.role ?? undefined,
    banned: userRow.banned ?? false,
    banReason: userRow.banReason ?? "",
    accounts: accounts.map((a) => a.providerId),
    lastSignIn: lastSession?.createdAt ?? null,
    createdAt: userRow.createdAt,
    avatarUrl: userRow.image || "",
    patientCode: patientRow?.patientCode ?? null,
    gender: patientRow?.gender ?? null,
    dateOfBirth: patientRow?.dateOfBirth ?? null,
    mobileNumber: patientRow?.mobileNumber ?? null,
    bloodGroup: patientRow?.bloodGroup ?? null,
    alternateMobile: patientRow?.alternateMobile ?? null,
    addressLine1: addressRow?.line1 ?? null,
    city: addressRow?.city ?? null,
    state: addressRow?.state ?? null,
    pincode: addressRow?.pincode ?? null,
    reports: await withReadableUrls(
      reports.map((r) => ({
        id: r.id,
        fileUrl: r.fileUrl,
        fileName: r.fileName,
        reportType: r.reportType,
        uploadedAt: r.uploadedAt,
      })),
    ),
  };
}