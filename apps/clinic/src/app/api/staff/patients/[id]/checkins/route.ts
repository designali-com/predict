import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { checkinOption, isCheckinKind } from "@workspace/db/checkin";
import { checkinsBetween, recentCheckins, recordCheckin } from "@workspace/db/checkin-log";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * The patient's daily check-ins — did they take their medicine, do their
 * exercises, follow their diet — answered from WhatsApp, or by staff.
 *
 * GET   { checkins } — the last 60 days, every kind; ?month=YYYY-MM for one month
 * POST  { kind, date, response } — staff record a day by hand (a call, a visit)
 *
 * The id may be the chart's or the contact's.
 */

const PERMS = ["clinic.patients", "clinic.appointments"];

async function contactIdFor(id: string) {
  const chart = await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, id) });
  return (
    chart?.contactId ??
    (await db.query.contact.findFirst({ columns: { id: true }, where: eq(contact.id, id) }))?.id ??
    null
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(PERMS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });
  const month = new URL(req.url).searchParams.get("month");
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return NextResponse.json({ checkins: await checkinsBetween(db, contactId, `${month}-01`, `${month}-${String(last).padStart(2, "0")}`) });
  }
  return NextResponse.json({ checkins: await recentCheckins(db, contactId) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(PERMS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = await contactIdFor((await params).id);
  if (!contactId) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { kind?: string; date?: string; response?: string } | null;
  const kind = body?.kind;
  if (!isCheckinKind(kind)) return NextResponse.json({ error: "Unknown check-in." }, { status: 400 });
  const option = checkinOption(kind, body?.response);
  if (!option || !body?.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "Pick a day and an answer." }, { status: 400 });
  }
  await recordCheckin(db, { contactId, kind, forDate: body.date, response: option.value, source: "staff" });
  return NextResponse.json({ checkins: await recentCheckins(db, contactId) });
}
