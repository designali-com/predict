import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  REFERRAL_SERVICES,
  ReferralStatus,
  listReferrals,
  moveReferral,
  referralCounts,
} from "@workspace/db/predict-referral";
import { requireApiPermission } from "@/src/lib/auth/permissions";
import { CLINIC_URL } from "@/src/lib/auth/config";

/**
 * Predict's referral queue (lab.predict.fit/referrals): the patients clinics
 * and partner hospitals have referred to Predict for diagnosis.
 *
 * GET   ?status=open|referred|in_progress|completed|cancelled  → { referrals, counts, services }
 * PATCH { referralId, status: in_progress | completed }
 */

const STATUSES = Object.values(ReferralStatus) as string[];

export async function GET(req: Request) {
  const session = await requireApiPermission("clinic.lab");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("status");
  const status = raw && STATUSES.includes(raw) ? (raw as ReferralStatus) : "open";
  const [rows, counts] = await Promise.all([listReferrals(db, { status }), referralCounts(db)]);
  // The chart lives on the clinic's host, also when the queue is opened on the lab's.
  const base = CLINIC_URL.replace(/\/$/, "");
  return NextResponse.json({
    referrals: rows.map((r) => ({ ...r, chartUrl: r.contactId ? `${base}/people/${r.contactId}` : null })),
    counts,
    services: REFERRAL_SERVICES,
  });
}

export async function PATCH(req: Request) {
  const session = await requireApiPermission("clinic.lab");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { referralId?: string; status?: string } | null;
  // Withdrawing is the referring clinic's; Predict takes it on and finishes it.
  if (!body?.referralId || (body.status !== ReferralStatus.IN_PROGRESS && body.status !== ReferralStatus.COMPLETED)) {
    return NextResponse.json({ error: "Status is in_progress or completed" }, { status: 400 });
  }
  const done = await moveReferral(db, body.referralId, body.status);
  if (!done) return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
