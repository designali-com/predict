import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { addCashDeposit, checkCashDeposit } from "@workspace/db/expense-service";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

/**
 * Cash sent from the drawer to the clinic's bank account — at the bank, or
 * through a person who took the cash and transferred it. Whoever takes
 * payments records it, as they do an expense; it is listed with the expenses.
 */
export async function POST(req: Request) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const text = (k: string) => String(body?.[k] ?? "").trim();
  const params = {
    clinicId: context.clinic.id,
    depositedOn: text("depositedOn"),
    amountInPaise: Math.round(Number(text("amount")) * 100),
    via: text("via"),
    personName: text("personName") || null,
    reference: text("reference") || null,
    note: text("note") || null,
    createdByUserId: context.session.user.id,
  };
  const problem = checkCashDeposit(params);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  try {
    const row = await addCashDeposit(db, params);
    return NextResponse.json({ deposit: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save the deposit." }, { status: 400 });
  }
}
