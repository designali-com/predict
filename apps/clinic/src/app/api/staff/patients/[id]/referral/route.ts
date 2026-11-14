import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import {
  REFERRAL_SERVICES,
  ReferralStatus,
  isReferralService,
  isReferred,
  predictResults,
  referToPredict,
  referralsFor,
  setReferralStatus,
} from "@workspace/db/predict-referral";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * The patient's referrals to Predict, and what Predict has found.
 *
 * GET    the referrals, the services one can be made for, and — once the
 *        patient has been referred — Predict's results, read-only
 * POST   { services, consent, note }   refer them; makes the predict.fit login
 * PATCH  { referralId, status: "cancelled" }   withdraw an open referral
 */

async function chartFor(id: string) {
  return (
    (await db.query.patientRecord.findFirst({ columns: { id: true }, where: eq(patientRecord.id, id) })) ??
    (await db.query.patientRecord.findFirst({ columns: { id: true }, where: eq(patientRecord.contactId, id) })) ??
    null
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chart = await chartFor((await params).id);
  if (!chart) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  return NextResponse.json({
    services: REFERRAL_SERVICES,
    referrals: await referralsFor(db, chart.id),
    results: (await isReferred(db, chart.id)) ? await predictResults(db, chart.id) : null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chart = await chartFor((await params).id);
  if (!chart) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { services?: unknown; consent?: unknown; note?: unknown } | null;
  const services = Array.isArray(body?.services) ? body.services : [];
  if (!services.every(isReferralService)) return NextResponse.json({ error: "Unknown service" }, { status: 400 });

  const result = await referToPredict(db, {
    patientId: chart.id,
    clinicId: context.clinic.id,
    services,
    consent: body?.consent === true,
    note: typeof body?.note === "string" ? body.note : null,
    actorUserId: context.session.user.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiPermission("clinic.patients");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { referralId?: string; status?: string } | null;
  // The clinic can only withdraw; Predict moves a referral on from its side.
  if (!body?.referralId || body.status !== ReferralStatus.CANCELLED) {
    return NextResponse.json({ error: "Only withdrawing a referral is possible here" }, { status: 400 });
  }
  const done = await setReferralStatus(db, body.referralId, context.clinic.id, ReferralStatus.CANCELLED);
  if (!done) return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
