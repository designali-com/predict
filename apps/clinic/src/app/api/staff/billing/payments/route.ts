import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { clinicDate } from "@workspace/db/availability-service";
import { PAYMENT_KINDS, PAYMENT_METHODS } from "@workspace/db/payment";
import { ledgerCount, ledgerRows, ledgerSummary, type LedgerFilter } from "@workspace/db/payment-ledger";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every payment this clinic took, in one list — with its totals and the
 * per-day series. `?format=csv` hands the same rows over for a spreadsheet.
 */
export async function GET(req: Request) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const p = url.searchParams;
  const to = DAY.test(p.get("to") ?? "") ? p.get("to")! : clinicDate(0);
  const from = DAY.test(p.get("from") ?? "") ? p.get("from")! : to;
  const filter: LedgerFilter = {
    clinicId: context.clinic.id,
    from: from <= to ? from : to,
    to: from <= to ? to : from,
    kind: p.get("kind") || null,
    method: p.get("method") || null,
    q: p.get("q") || null,
  };

  if (p.get("format") === "csv") {
    const rows = await ledgerRows(db, filter, 5000);
    const kindLabel = new Map(PAYMENT_KINDS.map((k) => [k.value as string, k.label]));
    const methodLabel = new Map(PAYMENT_METHODS.map((m) => [m.value as string, m.label]));
    const cell = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      ["Date", "Time", "Receipt", "Patient", "Phone", "For", "Method", "Reference", "Amount (INR)", "Taken by", "Status", "Void reason"],
      ...rows.map((r) => {
        const at = new Date(r.collectedAt);
        return [
          at.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
          at.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }),
          r.receiptNo,
          r.patient,
          r.phone,
          kindLabel.get(r.kind) ?? r.kind,
          methodLabel.get(r.method) ?? r.method,
          r.reference,
          (r.amountInPaise / 100).toFixed(2),
          r.collectedBy,
          r.voided ? "Cancelled" : "Paid",
          r.voidReason,
        ];
      }),
    ];
    return new NextResponse(lines.map((l) => l.map(cell).join(",")).join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="payments-${filter.from}-to-${filter.to}.csv"`,
      },
    });
  }

  // One page of the list at a time; the totals and chart cover the whole range.
  const size = [50, 100, 200].includes(Number(p.get("size"))) ? Number(p.get("size")) : 50;
  const page = Math.max(1, Math.floor(Number(p.get("page")) || 1));
  const [rows, total, summary] = await Promise.all([
    ledgerRows(db, filter, size, (page - 1) * size),
    ledgerCount(db, filter),
    ledgerSummary(db, filter),
  ]);
  return NextResponse.json({ from: filter.from, to: filter.to, rows, total, page, size, summary });
}
