import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { medicineSale } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { cancelMedicineBill, payMedicineBill } from "@workspace/db/medicine-sale";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { guardPatient } from "@/src/lib/auth/patient-scope";

/**
 * A medicine bill left owing: `pay` collects all of it or part, `cancel` takes
 * back one entered by mistake (nothing paid against it; stock goes back).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const [sale] = await db
    .select({ contactId: medicineSale.contactId, clinicId: medicineSale.clinicId })
    .from(medicineSale)
    .where(eq(medicineSale.id, id))
    .limit(1);
  // Another clinic's bill reads as no bill. An older one with no clinic goes
  // by its patient, below.
  if (!sale || (sale.clinicId && sale.clinicId !== context.clinic.id)) {
    return NextResponse.json({ error: "That medicine bill no longer exists." }, { status: 404 });
  }
  const blocked = await guardPatient(sale.contactId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  try {
    if (body?.action === "cancel") {
      await cancelMedicineBill(db, { saleId: id, reason: String(body?.reason ?? ""), actorId: context.session.user.id });
      return NextResponse.json({ ok: true });
    }
    const payment = await payMedicineBill(db, {
      saleId: id,
      amountInPaise: Math.round(Number(body?.amountInRupees ?? 0) * 100),
      method: body?.method,
      reference: body?.reference ?? null,
      actorId: context.session.user.id,
      clinicId: context.clinic.id,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not do that." }, { status: 400 });
  }
}
