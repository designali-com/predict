import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, user } from "@workspace/db/schema";
import { and, asc, desc, eq, gt, inArray, isNotNull, lte, ne, or, isNull, sql, type SQL } from "@workspace/db";
import { getAutomationSettings } from "@workspace/db/automation-settings";
import { TIMED_STATUSES } from "@workspace/db/lead-status";
import { requireClinicPermission } from "@/src/lib/auth/clinic";
import { leadScope, leadVisibility } from "@/src/lib/lead-access";

// Statuses that can carry a time to call again: a promised callback, and a
// not-connected call given a "try again at".
const TIMED = TIMED_STATUSES;

/**
 * Who to call, in the order to call them.
 *
 * Replaced the email alerts. A manager's inbox is not where calls get made;
 * the telecaller's screen is. Every section here is read straight from the
 * contact rows — nothing is stored — so a lead leaves the queue the moment
 * somebody sets its status, with no reminder left behind to clear.
 *
 * Scoped like the Leads page: this clinic only, and a telecaller sees their
 * own leads plus the unclaimed ones in their role's pool.
 */

/** Rows per section per page — ?pageSize= picks one of these. */
const PAGE_SIZES = [25, 50, 100];
const SECTION_KEYS = ["callbacksDue", "waiting", "fresh", "retry", "callbacksLater"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
/** A "No answer" is worth another try after this long. */
const RETRY_AFTER_HOURS = 2;
/** …but not forever: after a week of no answer it is a nurture job, not a call. */
const RETRY_WINDOW_DAYS = 7;

export async function GET(req: Request) {
  const context = await requireClinicPermission("ops.leads");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Each section pages on its own: ?pageSize=25&page.waiting=3. A section
  // without a page is on its first.
  const url = new URL(req.url);
  const requestedSize = Number(url.searchParams.get("pageSize"));
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 25;
  const pageOf = (key: SectionKey) => Math.max(1, Math.floor(Number(url.searchParams.get(`page.${key}`)) || 1));

  const scope = await leadScope(context.session.user);
  const settings = await getAutomationSettings(db, context.clinic.id);
  const now = new Date();
  const slaMinutes = settings.firstResponseMinutes > 0 ? settings.firstResponseMinutes : 30;
  const slaCutoff = new Date(now.getTime() - slaMinutes * 60_000);
  const endOfDay = new Date(now.getTime() + 24 * 3_600_000);

  // Every section shares these: this clinic, a live lead, allowed to be
  // contacted, and visible to this person.
  const base = (...extra: (SQL | undefined)[]) =>
    and(
      eq(contact.clinicId, context.clinic.id),
      eq(contact.stage, "LEAD"),
      or(isNull(contact.engagement), ne(contact.engagement, "DO_NOT_CONTACT")),
      leadVisibility(scope),
      ...extra,
    );

  // Status is nullable on older rows; a lead nobody has ever set is New.
  const isNew = sql`coalesce(${contact.leadStatus}, 'NEW') = 'NEW'`;

  const select = {
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    city: contact.city,
    interest: contact.interest,
    source: contact.source,
    campaign: contact.campaign,
    createdAt: contact.createdAt,
    leadStatus: contact.leadStatus,
    leadStatusAt: contact.leadStatusAt,
    callbackAt: contact.callbackAt,
    assignedUserId: contact.assignedUserId,
    assignedName: user.name,
  };

  // One page of a section, and how many the whole section holds — the tile
  // counts are the real totals, not the length of the page on screen.
  const query = async (key: SectionKey, where: SQL | undefined, order: SQL[]) => {
    const [counted] = await db.select({ n: sql<number>`count(*)::int` }).from(contact).where(where);
    const total = counted?.n ?? 0;
    // Calls take leads off the queue between refreshes; a page past the end
    // shows the last one rather than an empty section.
    const page = Math.min(pageOf(key), Math.max(1, Math.ceil(total / pageSize)));
    const rows = await db
      .select(select)
      .from(contact)
      .leftJoin(user, eq(user.id, contact.assignedUserId))
      .where(where)
      .orderBy(...order, asc(contact.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { rows, total, page };
  };

  const [callbacksDue, waiting, fresh, retry, callbacksLater] = await Promise.all([
    // They asked to be called at a time that has now come.
    query(
      "callbacksDue",
      base(inArray(contact.leadStatus, TIMED), isNotNull(contact.callbackAt), lte(contact.callbackAt, now)),
      [asc(contact.callbackAt)],
    ),
    // Past the first-response window and still untouched. Newest breach
    // first: speed-to-lead decays fast, and a lead that crossed the line
    // five minutes ago is still very likely to pick up.
    query("waiting", base(isNew, lte(contact.createdAt, slaCutoff)), [desc(contact.createdAt)]),
    // Inside the window — call before they tip into the section above.
    query("fresh", base(isNew, gt(contact.createdAt, slaCutoff)), [asc(contact.createdAt)]),
    // Tried, no answer, long enough ago to try again.
    query(
      "retry",
      base(
        or(
          and(
            // Did not connect. One with a "try again at" waits for that time instead (above).
            inArray(contact.leadStatus, ["NO_ANSWER", "NOT_REACHABLE"]),
            isNull(contact.callbackAt),
            lte(contact.leadStatusAt, new Date(now.getTime() - RETRY_AFTER_HOURS * 3_600_000)),
          ),
          // A missed or cancelled appointment is a booking to win back — at
          // once, not after the no-answer wait.
          inArray(contact.leadStatus, ["APPOINTMENT_MISSED", "APPOINTMENT_CANCELLED"]),
        ),
        gt(contact.leadStatusAt, new Date(now.getTime() - RETRY_WINDOW_DAYS * 86_400_000)),
      ),
      [asc(contact.leadStatusAt)],
    ),
    // Promised for later today — so nobody is surprised by them.
    query(
      "callbacksLater",
      base(inArray(contact.leadStatus, TIMED), gt(contact.callbackAt, now), lte(contact.callbackAt, endOfDay)),
      [asc(contact.callbackAt)],
    ),
  ]);

  const shape = ({ rows }: typeof callbacksDue) =>
    rows.map((r) => ({
      ...r,
      assignedToMe: r.assignedUserId === context.session.user.id,
      createdAt: r.createdAt.toISOString(),
      leadStatusAt: r.leadStatusAt?.toISOString() ?? null,
      callbackAt: r.callbackAt?.toISOString() ?? null,
    }));

  return NextResponse.json({
    generatedAt: now.toISOString(),
    clinic: { id: context.clinic.id, name: context.clinic.name },
    firstResponseMinutes: slaMinutes,
    retryAfterHours: RETRY_AFTER_HOURS,
    seesEveryone: scope.all,
    sections: {
      callbacksDue: shape(callbacksDue),
      waiting: shape(waiting),
      fresh: shape(fresh),
      retry: shape(retry),
      callbacksLater: shape(callbacksLater),
    },
    // Every section's full size and the page on screen.
    pageSize,
    totals: {
      callbacksDue: callbacksDue.total,
      waiting: waiting.total,
      fresh: fresh.total,
      retry: retry.total,
      callbacksLater: callbacksLater.total,
    },
    pages: {
      callbacksDue: callbacksDue.page,
      waiting: waiting.page,
      fresh: fresh.page,
      retry: retry.page,
      callbacksLater: callbacksLater.page,
    },
  });
}
