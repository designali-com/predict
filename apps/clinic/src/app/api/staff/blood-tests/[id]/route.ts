import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { recordPayment } from "@workspace/db/payment-service";
import { PaymentKind } from "@workspace/db/payment";
import {
  bloodTestBalance,
  updateBloodTestOrder,
  type BloodTestStatus,
} from "@workspace/db/blood-test";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { describeError } from "@/src/lib/api-error";
import { guardBloodTestOrder } from "@/src/lib/auth/patient-scope";

const CAN_USE = ["clinic.patients", "clinic.appointments", "clinic.billing", "clinic.biomarkers"];
const CAN_TAKE_MONEY = ["clinic.billing", "clinic.patients", "clinic.appointments"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await guardBloodTestOrder((await ctx.params).id);
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_USE);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const balance = await bloodTestBalance(db, id);
  if (!balance) return NextResponse.json({ error: "No such blood test" }, { status: 404 });

  return NextResponse.json(balance);
}

/**
 * Take money for a blood test, or move the order along.
 *
 * Payment goes through the same recordPayment every other counter takes money
 * with, so it lands in the one ledger, gets a receipt number from the same
 * sequence, and shows up in Billing beside consultations and treatment plans.
 * A second way to record money is how two screens end up disagreeing about
 * what a patient owes.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await guardBloodTestOrder((await ctx.params).id);
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_TAKE_MONEY);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);

  const balance = await bloodTestBalance(db, id);
  if (!balance) return NextResponse.json({ error: "No such blood test" }, { status: 404 });
  if (!balance.order.contactId) {
    return NextResponse.json(
      { error: "This patient has no contact record, so a payment cannot be filed." },
      { status: 400 },
    );
  }
  if (balance.order.cancelledAt) {
    return NextResponse.json({ error: "This blood test was cancelled." }, { status: 400 });
  }

  const rupees = Number(body?.amountInRupees);
  const amountInPaise = Number.isFinite(rupees)
    ? Math.round(rupees * 100)
    : balance.dueInPaise;

  if (amountInPaise <= 0) {
    return NextResponse.json({ error: "Enter an amount greater than zero." }, { status: 400 });
  }
  // Refused rather than silently accepted: an overpayment here would make the
  // patient's ledger disagree with the bill they were handed.
  if (amountInPaise > balance.dueInPaise) {
    return NextResponse.json(
      { error: `Only ₹${(balance.dueInPaise / 100).toLocaleString("en-IN")} is outstanding.` },
      { status: 400 },
    );
  }

  try {
    const created = await recordPayment(db, {
      contactId: balance.order.contactId,
      kind: PaymentKind.BLOOD_TEST,
      bloodTestOrderId: id,
      amountInPaise,
      method: body?.method ? String(body.method) : "cash",
      reference: body?.reference ? String(body.reference) : null,
      note: body?.note ? String(body.note) : null,
      actorId: session.user.id,
    });

    return NextResponse.json(
      { paymentId: created.id, receiptNo: created.receiptNo, amountInPaise },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not record that payment") },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await guardBloodTestOrder((await ctx.params).id);
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_USE);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);

  try {
    const updated = await updateBloodTestOrder(db, id, {
      status: body?.status as BloodTestStatus | undefined,
      collectedOn: body?.collectedOn === undefined ? undefined : (body.collectedOn || null),
      note: body?.note,
      cancelReason: body?.cancelReason,
    });
    if (!updated) return NextResponse.json({ error: "No such blood test" }, { status: 404 });
    return NextResponse.json({ order: updated });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not update that blood test") },
      { status: 400 },
    );
  }
}
