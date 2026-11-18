import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { EXPENSES_ALL } from "@workspace/db/expense";
import { addRecurring, listRecurring, postDueRecurring, setRecurringActive } from "@workspace/db/expense-service";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

/** Monthly repeats — rent, salaries. Admin and manager. */
export async function GET() {
  const context = await requireClinicApiPermission(EXPENSES_ALL);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ repeats: await listRecurring(db, context.clinic.id) });
}

export async function POST(req: Request) {
  const context = await requireClinicApiPermission(EXPENSES_ALL);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  try {
    const row = await addRecurring(db, {
      clinicId: context.clinic.id,
      category: String(body?.category ?? ""),
      amountInPaise: Math.round(Number(body?.amount) * 100),
      method: String(body?.method ?? ""),
      paidTo: body?.paidTo ? String(body.paidTo) : null,
      note: body?.note ? String(body.note) : null,
      dayOfMonth: Number(body?.dayOfMonth),
      startsOn: String(body?.startsOn ?? ""),
      createdByUserId: context.session.user.id,
    });
    // This month's, if its day has already passed.
    const posted = await postDueRecurring(db, context.clinic.id);
    return NextResponse.json({ repeat: row, posted }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save it." }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const context = await requireClinicApiPermission(EXPENSES_ALL);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  try {
    const row = await setRecurringActive(db, { id: String(body?.id ?? ""), clinicId: context.clinic.id, active: Boolean(body?.active) });
    return NextResponse.json({ repeat: row });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not change it." }, { status: 400 });
  }
}
