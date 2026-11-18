import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { voidPayment } from "@workspace/db/payment-service";
import { isPartnerClinic } from "@workspace/db/clinic-service";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";

/**
 * Cancel a payment without erasing it.
 *
 * A reason is required because the row survives: a ledger that reconciled
 * yesterday has to be re-reconcilable today, and "why is this £1,500 not
 * counted?" needs an answer written at the time rather than remembered.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  try {
    // Only money this clinic banked can be cancelled from its desk.
    const payment = await voidPayment(db, id, String(body?.reason ?? ""), context.session.user.id, {
      clinicId: context.clinic.id,
      unplaced: !isPartnerClinic(context.clinic),
    });
    return NextResponse.json({ payment });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not cancel that payment") },
      { status: 400 },
    );
  }
}
