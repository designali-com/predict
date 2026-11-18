import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/src/lib/auth/auth";
import { headers } from "next/headers";
import { getUsers } from "@/src/utils/user";
import { isAdminRole, canViewUserDirectory, resolveRole } from "@/src/lib/auth/config";
import { upsertPatient } from "@/src/lib/patients";
import { upsertContactForRegisteredUser } from "@/src/lib/contact";
import { db } from "@workspace/db/client";
import { user as userTable } from "@workspace/db/schema";
import { getRole } from "@workspace/db/role-service";
import { describeError } from "@/src/lib/api-error";
import { eq } from "@workspace/db";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !isAdminRole(session.user.role)) {
    return null;
  }
  return session;
}

async function requireDirectoryViewer() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !canViewUserDirectory(session.user.role)) {
    return null;
  }
  return session;
}

export async function GET(request: NextRequest) {
  const session = await requireDirectoryViewer();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;
    const role = searchParams.get("role") || undefined;
    // "roles=a,b" is the Team page's "everyone" — one query rather than one
    // request per role, and correct past the first page of results.
    const roles = searchParams.get("roles")?.split(",").filter(Boolean);
    const name = searchParams.get("name") || undefined;
    const email = searchParams.get("email") || undefined;

    const { users, total } = await getUsers({ limit, offset, role, roles, name, email });

    return NextResponse.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Inside the try: a failure while reading the session used to escape the
    // handler entirely, and an escaped error is served as an HTML page rather
    // than the JSON the caller is parsing.
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, password, role, mobileNumber, gender, dateOfBirth } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { error: "name, email, password and role are required" },
        { status: 400 }
      );
    }

    // The role has to exist in the catalogue, not in an enum — that is the
    // whole point of roles being data. A typo here would otherwise create an
    // account holding a key nothing describes, which resolves to no pages and
    // lands them in the patient app with no explanation.
    const roleRecord = await getRole(db, role);
    if (!roleRecord) {
      return NextResponse.json(
        { error: `"${role}" is not a role. Create it on the Roles page first.` },
        { status: 400 },
      );
    }

    const isPatient = resolveRole(role) === "patient";
    if (isPatient && (!mobileNumber || !gender || !dateOfBirth)) {
      return NextResponse.json(
        { error: "mobileNumber, gender and dateOfBirth are required for a patient" },
        { status: 400 }
      );
    }

    // The role is written here, not handed to better-auth. Its admin plugin
    // validates role against a map built at module load from the roles the
    // code knows, and rejects anything else as a "non-existent role" — so a
    // role created from the Roles page could never be assigned through it
    // without a server restart. Our own authorization reads role_permission,
    // which does not care how the value got into the column.
    const result = await auth.api.createUser({
      headers: await headers(),
      body: {
        name,
        email,
        password,
        // skip email verification for admin-created users
        data: { emailVerified: true },
      },
    });

    await db
      .update(userTable)
      .set({ role: roleRecord.key, updatedAt: new Date() })
      .where(eq(userTable.id, result.user.id));

    if (isPatient) {
      // Contact first, then the chart. upsertPatient fills patient_record.
      // contactId by looking the contact up from the user id — so running it
      // first, as this did, could never find one: the contact was created on
      // the next line. Every patient made from this panel got a chart with a
      // null contactId, and deleting that account later (which nulls userId
      // too) orphaned the chart from both sides with no way back to the
      // person it belongs to.
      await upsertContactForRegisteredUser({
        userId: result.user.id,
        email,
        name,
        phone: mobileNumber,
        source: "IN_CLINIC",
      });

      await upsertPatient({
        userId: result.user.id,
        fallbackFullName: name,
        gender,
        dateOfBirth,
        mobileNumber,
        email,
      });
    }

    return NextResponse.json(
      { user: { ...result.user, role: roleRecord.key } },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: describeError(error, "Failed to create user") },
      { status: 500 },
    );
  }
}
