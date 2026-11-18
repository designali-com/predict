import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { bloodTestOrder } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { recordPayment } from "@workspace/db/payment-service";
import { requireApiPermission } from "@/src/lib/auth/permissions";
import { describeError } from "@/src/lib/api-error";

/**
 * Money taken for a blood test at the centre (cash, UPI, card) — a receipt
 * like any other payment. Home collection will be paid by link (Razorpay,
 * later), which lands here the same way.
 *
 * POST { amountInRupees, method, reference? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiPermission("clinic.lab");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [order] = await db
    .select({ contactId: bloodTestOrder.contactId })
    .from(bloodTestOrder)
    .where(eq(bloodTestOrder.id, id))
    .limit(1);
  if (!order) return NextResponse.json({ error: "No such order." }, { status: 404 });
  if (!order.contactId) return NextResponse.json({ error: "This order has no patient contact to bill." }, { status: 409 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const payment = await recordPayment(db, {
      contactId: order.contactId,
      kind: "blood_test",
      bloodTestOrderId: id,
      amountInPaise: Math.round(Number(body?.amountInRupees ?? 0) * 100),
      method: typeof body?.method === "string" ? body.method : "cash",
      reference: typeof body?.reference === "string" ? body.reference : null,
      actorId: session.user.id,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not record the payment") }, { status: 400 });
  }
}
