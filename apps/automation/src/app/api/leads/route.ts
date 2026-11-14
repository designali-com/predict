import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, communicationMessage, appointment, user } from "@workspace/db/schema";
import { isLeadStatus } from "@workspace/db/lead-status";
import { leadScope, leadVisibility } from "@/src/lib/lead-access";
import { and, desc, eq, exists, ilike, inArray, isNotNull, isNull, notExists, or, sql, type SQL } from "@workspace/db";
import { isContactStage } from "@workspace/db/contact-stage";
import { grantedPermissions } from "@workspace/db/permission-service";
import {
  isContactSide,
  SIDE_META,
  SIDE_STAGES,
  sidesFor,
  stagesForSides,
  type ContactSide,
} from "@workspace/db/contact-side";
import { requireClinicAnyPermission, requireClinicPermission } from "@/src/lib/auth/clinic";
import { normalizePhone } from "@/src/lib/normalize-phone";
import { announceNewLead, markAsLead } from "@workspace/db/lead-promotion";
import { routeLead } from "@workspace/db/lead-routing";
import { ContactStage } from "@workspace/db/contact-stage";
import { OPS_KEYS } from "@workspace/db/permissions";
import { leadListQuery } from "@/src/lib/lead-list-query";

const MAX_ROWS = 1000;

export async function GET(req: Request) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;

  const url = new URL(req.url);
  // Paging: ?page=1&limit=50|100|200. Without limit, the old single capped list.
  const askedLimit = Number(url.searchParams.get("limit"));
  const pageSize = [50, 100, 200].includes(askedLimit) ? askedLimit : null;
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const q = await leadListQuery(url, context);
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 403 });
  const { filters, scope, sides, match, held, withPhoneOnly, enquiredAt } = q;

  const leads = await db
    .select({
      enquiredAt,
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      stage: contact.stage,
      engagement: contact.engagement,
      source: contact.source,
      campaign: contact.campaign,
      createdAt: contact.createdAt,
      lastTouchAt: contact.lastTouchAt,
      leadStatus: contact.leadStatus,
      leadStatusAt: contact.leadStatusAt,
      callbackAt: contact.callbackAt,
      interest: contact.interest,
      city: contact.city,
      assignedRole: contact.assignedRole,
      assignedUserId: contact.assignedUserId,
      assignedUserName: user.name,
    })
    .from(contact)
    .leftJoin(user, eq(user.id, contact.assignedUserId))
    .where(and(...filters))
    .orderBy(desc(enquiredAt), desc(contact.createdAt))
    .limit(pageSize ?? MAX_ROWS)
    .offset(pageSize ? (page - 1) * pageSize : 0);

  // How many match in all, for the page count. Only when paging was asked for —
  // other callers still get up to MAX_ROWS in one go.
  const total = pageSize
    ? ((
        await db
          .select({ n: sql<number>`count(*)::int` })
          .from(contact)
          .leftJoin(user, eq(user.id, contact.assignedUserId))
          .where(and(...filters))
      )[0]?.n ?? 0)
    : null;

  return NextResponse.json({
    leads,
    canSeeAll: scope.all,
    total,
    page: pageSize ? page : null,
    pageSize,
    truncated: !pageSize && leads.length === MAX_ROWS,
    elsewhere: await countElsewhere(sides, match, held, withPhoneOnly, context.clinic.id),
  });
}

/**
 * How many people this search would have found on the other list.
 *
 * Splitting the lists reintroduced a failure the merge had fixed: search for
 * someone who has since become a patient while you are on Leads, get nothing,
 * conclude there is no record, create a duplicate. A count — never the rows —
 * is enough to prevent that, and it is safe to give to someone who cannot open
 * the other list, because "this person exists somewhere you cannot see" is not
 * a disclosure of anything about them.
 */
async function countElsewhere(
  sides: ContactSide[],
  match: SQL | undefined,
  held: string[],
  withPhoneOnly: boolean,
  clinicId: string,
) {
  // Only worth answering for a search. Without one the question is "how many
  // patients are there", which is the other page's job to show.
  if (!match || sides.length !== 1) return null;

  const other: ContactSide = sides[0] === "leads" ? "patients" : "leads";

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contact)
    .where(
      and(
        or(eq(contact.clinicId, clinicId), isNull(contact.clinicId))!,
        inArray(contact.stage, SIDE_STAGES[other]),
        match,
        // The same default the other list applies, so following the link
        // cannot land on a page that shows fewer people than the count promised.
        ...(withPhoneOnly ? [isNotNull(contact.phone)] : []),
      ),
    );

  return {
    side: other,
    count: row?.count ?? 0,
    permitted: held.includes(SIDE_META[other].permission),
  };
}

/**
 * A lead typed in by staff. Stage LEAD, call status New — the same arrival
 * as a form or an ad, so the new-lead flows start. No appointment is booked.
 */
export async function POST(req: Request) {
  const context = await requireClinicPermission("ops.leads");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phoneRaw = typeof body?.phone === "string" ? body.phone : "";
  const emailRaw = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const city = typeof body?.city === "string" ? body.city.trim() : "";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const phone = normalizePhone(phoneRaw);
  if (!phone.ok) return NextResponse.json({ error: phone.error ?? "Phone number is not valid" }, { status: 400 });
  const email = emailRaw || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email is not valid" }, { status: 400 });
  }

  const [byPhone] = await db.select().from(contact).where(eq(contact.phone, phone.phone)).limit(1);
  if (byPhone && byPhone.stage !== ContactStage.AUDIENCE) {
    return NextResponse.json(
      { error: "This number is already on file.", contactId: byPhone.id },
      { status: 409 },
    );
  }

  if (email) {
    const [byEmail] = await db.select({ id: contact.id }).from(contact).where(eq(contact.email, email)).limit(1);
    if (byEmail && byEmail.id !== byPhone?.id) {
      return NextResponse.json({ error: "This email already belongs to someone else." }, { status: 409 });
    }
  }

  const now = new Date();
  const clinicId = context.clinic.id;
  let contactId: string;

  if (byPhone) {
    await db
      .update(contact)
      .set({
        name: byPhone.name || name,
        ...(email && !byPhone.email ? { email } : {}),
        ...(city && !byPhone.city ? { city } : {}),
        ...(!byPhone.clinicId ? { clinicId } : {}),
        ...(!byPhone.source ? { source: "MANUAL" } : {}),
        updatedAt: now,
      })
      .where(eq(contact.id, byPhone.id));
    const promoted = await markAsLead(db, byPhone.id, { source: byPhone.source ?? "MANUAL" }, "Added by staff");
    if (!promoted) {
      return NextResponse.json({ error: "This number is already on file.", contactId: byPhone.id }, { status: 409 });
    }
    contactId = byPhone.id;
  } else {
    const [created] = await db
      .insert(contact)
      .values({
        name,
        phone: phone.phone,
        email,
        city: city || null,
        stage: ContactStage.LEAD,
        leadStatus: "NEW",
        leadStatusAt: now,
        source: "MANUAL",
        clinicId,
        firstTouchAt: now,
        lastTouchAt: now,
      })
      .returning({ id: contact.id });
    if (!created) return NextResponse.json({ error: "Could not create the lead" }, { status: 500 });
    contactId = created.id;
  }

  const routing = await routeLead(db, contactId, { city: city || null, source: "MANUAL" });
  await announceNewLead(db, contactId, { source: "MANUAL", city: routing.city ?? city });

  return NextResponse.json({ id: contactId, leadStatus: "NEW" }, { status: 201 });
}
