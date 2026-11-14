import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { EXPENSES_ALL } from "@workspace/db/expense";
import { collectedBetween, expenseSummary, indiaToday, monthlyMargin, postDueRecurring } from "@workspace/db/expense-service";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Collected − spent = net, for a range, with the last six months beside it.
 * Admin and manager only: it is the clinic's margin, salaries and all.
 */
export async function GET(req: Request) {
  const context = await requireClinicApiPermission(EXPENSES_ALL);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await postDueRecurring(db, context.clinic.id).catch(() => 0);

  const p = new URL(req.url).searchParams;
  const today = indiaToday();
  const to = DAY.test(p.get("to") ?? "") ? p.get("to")! : today;
  const from = DAY.test(p.get("from") ?? "") ? p.get("from")! : today.slice(0, 8) + "01";
  const [collected, spent, months] = await Promise.all([
    collectedBetween(db, context.clinic.id, from, to),
    expenseSummary(db, { clinicId: context.clinic.id, from, to }),
    monthlyMargin(db, context.clinic.id, 6),
  ]);
  return NextResponse.json({
    from,
    to,
    collectedInPaise: collected,
    spentInPaise: spent.spentInPaise,
    netInPaise: collected - spent.spentInPaise,
    byCategory: spent.byCategory,
    months,
  });
}
