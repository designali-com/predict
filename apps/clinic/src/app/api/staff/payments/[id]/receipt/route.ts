import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { receiptFor } from "@workspace/db/receipt";
import { isPartnerClinic } from "@workspace/db/clinic-service";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

/**
 * One receipt, read back from the payment it belongs to.
 *
 * Nothing is passed in but the payment id: the amount, the number, who took it
 * and when all come off the stored row. A receipt assembled from whatever the
 * screen was holding could differ from what was banked. Only a payment on
 * the active clinic's books is found.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const receipt = await receiptFor(db, id, {
    clinicId: context.clinic.id,
    unplaced: !isPartnerClinic(context.clinic),
  });

  if (!receipt) return NextResponse.json({ error: "No such payment" }, { status: 404 });
  return NextResponse.json({ receipt });
}
