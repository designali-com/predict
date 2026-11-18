import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@workspace/db/client";
import { contact, leadRule, user } from "@workspace/db/schema";
import { and, desc, eq, inArray, sql } from "@workspace/db";
import { leadStatusMeta } from "@workspace/db/lead-status";
import { OPS_KEYS } from "@workspace/db/permissions";
import { requireClinicAnyPermission } from "@/src/lib/auth/clinic";
import { leadListQuery } from "@/src/lib/lead-list-query";
import { operationalStageExpr } from "@/src/lib/operational-stage-sql";
import { REGION_SQL, REGIONS } from "@/src/lib/region-sql";
import { EXPORT_COLUMNS, isExportColumn } from "@/src/lib/lead-export-columns";
import { OPERATIONAL_STAGES } from "@workspace/db/operational-stage";

// A safety cap: far above any real list, low enough that one click cannot
// build a file that takes the server down.
const MAX_EXPORT = 20000;

/**
 * The people list as a file: the rows the on-screen filters select (or just
 * the ticked ones), with the columns the person chose, as CSV or Excel.
 * Uses the list's own query, so nobody exports a lead they could not see.
 */
export async function GET(req: Request) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = await leadListQuery(url, context);
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 403 });
  const { filters, enquiredAt } = q;

  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (ids.length) filters.push(inArray(contact.id, ids));

  const asked = (url.searchParams.get("columns") ?? "").split(",").filter(isExportColumn);
  const columns = EXPORT_COLUMNS.filter((c) => asked.includes(c.key));
  if (!columns.length) return NextResponse.json({ error: "Pick at least one column" }, { status: 400 });
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const region = sql<string>`case
    when ${REGION_SQL.KOLKATA} then 'KOLKATA'
    when ${REGION_SQL.DELHI} then 'DELHI'
    else 'OTHER' end`;
  const wantFunnel = columns.some((c) => c.key === "funnelStage");
  const wantRegion = columns.some((c) => c.key === "region");

  const rows = await db
    .select({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      city: contact.city,
      interest: contact.interest,
      source: contact.source,
      sourcePlatform: contact.sourcePlatform,
      campaign: contact.campaign,
      stage: contact.stage,
      leadStatus: contact.leadStatus,
      leadStatusAt: contact.leadStatusAt,
      callbackAt: contact.callbackAt,
      owner: user.name,
      assignedRole: contact.assignedRole,
      engagement: contact.engagement,
      createdAt: contact.createdAt,
      enquiredAt,
      lastTouchAt: contact.lastTouchAt,
      // Only worked out when asked for: both are per-row subqueries.
      region: wantRegion ? region : sql<string>`null`,
      funnelStage: wantFunnel ? sql<string>`${operationalStageExpr}` : sql<string>`null`,
    })
    .from(contact)
    .leftJoin(user, eq(user.id, contact.assignedUserId))
    .where(and(...filters))
    .orderBy(desc(enquiredAt), desc(contact.createdAt))
    .limit(MAX_EXPORT);

  const icpNames = new Map(
    (await db.select({ code: leadRule.interest, name: leadRule.name }).from(leadRule).where(eq(leadRule.kind, "interest")))
      .filter((r) => r.code)
      .map((r) => [r.code!, r.name]),
  );
  const regionLabel = new Map<string, string>(REGIONS.map((r) => [r.value, r.label]));
  const funnelLabel = new Map<string, string>(OPERATIONAL_STAGES.map((s) => [s.stage, s.label]));

  // Timestamps are stored in UTC; people read them in IST.
  const ist = (v: Date | string | null) => {
    if (!v) return "";
    const d = new Date(typeof v === "string" && !/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? `${v.replace(" ", "T")}Z` : v);
    if (Number.isNaN(d.getTime())) return "";
    return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16).replace("T", " ");
  };

  const value = (r: (typeof rows)[number], key: string): string => {
    switch (key) {
      case "phone":
        return r.phone ? `+${r.phone.replace(/^\+/, "")}` : "";
      case "region":
        return r.region ? (regionLabel.get(r.region) ?? r.region) : "";
      case "interest":
        return r.interest ? (icpNames.get(r.interest) ?? r.interest.replace(/_/g, " ")) : "";
      case "funnelStage":
        return r.funnelStage ? (funnelLabel.get(r.funnelStage) ?? r.funnelStage) : "";
      case "leadStatus":
        return r.leadStatus ? (leadStatusMeta(r.leadStatus)?.label ?? r.leadStatus) : "";
      case "owner":
        return r.owner ?? (r.assignedRole ? `${r.assignedRole} pool` : "");
      case "doNotContact":
        return r.engagement === "DO_NOT_CONTACT" ? "Yes" : "";
      case "leadStatusAt":
      case "callbackAt":
      case "createdAt":
      case "enquiredAt":
      case "lastTouchAt":
        return ist(r[key] as Date | string | null);
      default: {
        const v = r[key as keyof typeof r];
        return v == null ? "" : String(v);
      }
    }
  };

  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => value(r, c.key)));
  const stamp = ist(new Date()).slice(0, 10);
  const list = url.searchParams.get("list") === "patients" ? "patients" : "leads";
  const filename = `${list}-${stamp}.${format}`;

  if (format === "xlsx") {
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws["!cols"] = columns.map((c) => ({ wch: Math.min(40, Math.max(c.label.length + 2, ...body.slice(0, 200).map((b) => (b[columns.indexOf(c)] ?? "").length + 1))) }));
    ws["!autofilter"] = { ref: ws["!ref"]! };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, list === "leads" ? "Leads" : "Patients");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // CSV with a BOM so Excel opens names in Hindi or Bengali correctly. A
  // leading = + - @ is neutralised so a cell cannot run as a formula.
  const cell = (v: string) => {
    const safe = /^[=+\-@]/.test(v) && !/^\+\d+$/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const csv = "﻿" + [header, ...body].map((line) => line.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
