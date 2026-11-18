import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { can } from "@workspace/db/permission-service";
import { checkDocumentFile } from "@workspace/db/person-documents";
import { EXPENSE_CATEGORY_LABEL, EXPENSES_ALL } from "@workspace/db/expense";
import {
  addExpense,
  cashClosing,
  countExpenses,
  checkExpense,
  expenseSummary,
  indiaToday,
  listCashDeposits,
  listExpenses,
  postDueRecurring,
  type ExpenseFilter,
} from "@workspace/db/expense-service";
import { PAYMENT_METHODS } from "@workspace/db/payment";
import { deleteFile, readableUrl, uploadFile } from "@workspace/storage";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Expenses for the Billing page.
 *
 * Anyone who takes payments enters expenses and sees their own, plus the
 * drawer figure for the day. Every expense — salaries included — and the
 * monthly repeats are clinic.expenses_all.
 */
export async function GET(req: Request) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const all = await can(db, context.principal, EXPENSES_ALL);

  // The month's rent and salaries appear on their day without anyone typing them.
  await postDueRecurring(db, context.clinic.id).catch((err) => console.error("[expenses] repeats:", err));

  const p = new URL(req.url).searchParams;
  const to = DAY.test(p.get("to") ?? "") ? p.get("to")! : indiaToday();
  const from = DAY.test(p.get("from") ?? "") ? p.get("from")! : to;
  const filter: ExpenseFilter = {
    clinicId: context.clinic.id,
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    category: p.get("category") || null,
    method: p.get("method") || null,
    q: p.get("q") || null,
    createdBy: all ? null : context.session.user.id,
  };

  if (p.get("format") === "csv") {
    const rows = await listExpenses(db, filter, 5000);
    const methodLabel = new Map(PAYMENT_METHODS.map((m) => [m.value as string, m.label]));
    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      ["Date", "Category", "Paid to", "Method", "Reference", "Amount (INR)", "Note", "Entered by", "Status", "Void reason"],
      ...rows.map((r) => [
        r.spentOn,
        EXPENSE_CATEGORY_LABEL[r.category] ?? r.category,
        r.paidTo,
        methodLabel.get(r.method) ?? r.method,
        r.reference,
        (r.amountInPaise / 100).toFixed(2),
        r.note,
        r.enteredBy,
        r.voided ? "Cancelled" : "Paid",
        r.voidReason,
      ]),
    ];
    return new NextResponse(lines.map((l) => l.map(cell).join(",")).join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="expenses-${filter.from}-to-${filter.to}.csv"`,
      },
    });
  }

  const cashDay = DAY.test(p.get("cashDay") ?? "") ? p.get("cashDay")! : indiaToday();
  // One page of the list at a time; the totals cover the whole range.
  const size = [50, 100, 200].includes(Number(p.get("size"))) ? Number(p.get("size")) : 50;
  const page = Math.max(1, Math.floor(Number(p.get("page")) || 1));
  const [rows, total, summary, cash, deposits] = await Promise.all([
    listExpenses(db, filter, size, (page - 1) * size),
    countExpenses(db, filter),
    expenseSummary(db, filter),
    cashClosing(db, context.clinic.id, cashDay),
    listCashDeposits(db, { clinicId: filter.clinicId, from: filter.from, to: filter.to, createdBy: filter.createdBy }),
  ]);
  // Bills are private; hand out a short-lived link only to who can see the row.
  const withLinks = await Promise.all(
    rows.map(async (r) => ({ ...r, billUrl: r.billUrl ? await readableUrl(r.billUrl).catch(() => null) : null })),
  );
  return NextResponse.json({ from: filter.from, to: filter.to, all, rows: withLinks, total, page, size, summary, cash, deposits });
}

export async function POST(req: Request) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Nothing was sent." }, { status: 400 });
  const text = (k: string) => String(form.get(k) ?? "").trim();
  const params = {
    clinicId: context.clinic.id,
    spentOn: text("spentOn"),
    category: text("category"),
    amountInPaise: Math.round(Number(text("amount")) * 100),
    method: text("method"),
    paidTo: text("paidTo") || null,
    reference: text("reference") || null,
    note: text("note") || null,
    createdByUserId: context.session.user.id,
  };
  const problem = checkExpense(params);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // The bill photo is optional; checked before anything is stored.
  const file = form.get("bill");
  let bill: { url: string; name: string } | null = null;
  if (file instanceof File && file.size > 0) {
    const check = checkDocumentFile({ name: file.name, type: file.type, size: file.size });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    const upload = await uploadFile({
      visibility: "private",
      folder: `expenses/${context.clinic.id}`,
      fileName: file.name,
      body: Buffer.from(await file.arrayBuffer()),
      contentType: check.mime,
    }).catch(() => null);
    if (!upload) return NextResponse.json({ error: "File storage refused the bill photo." }, { status: 502 });
    bill = { url: upload.url, name: file.name };
  }

  try {
    const row = await addExpense(db, { ...params, billUrl: bill?.url ?? null, billName: bill?.name ?? null });
    return NextResponse.json({ expense: row }, { status: 201 });
  } catch (err) {
    if (bill) await deleteFile(bill.url);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save the expense." }, { status: 400 });
  }
}
