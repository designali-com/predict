import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { EXPENSES_ALL } from "@workspace/db/expense";
import { voidExpense } from "@workspace/db/expense-service";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

/** Cancel an expense, keeping it on the list with the reason. Admin and manager. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicApiPermission(EXPENSES_ALL);
  if (!context) return NextResponse.json({ error: "Only an admin or manager can cancel an expense." }, { status: 403 });
  const body = await req.json().catch(() => null);
  try {
    const row = await voidExpense(db, {
      id: (await params).id,
      clinicId: context.clinic.id,
      reason: String(body?.reason ?? ""),
      actorId: context.session.user.id,
    });
    return NextResponse.json({ expense: row });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not cancel it." }, { status: 400 });
  }
}
