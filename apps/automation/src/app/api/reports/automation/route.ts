import { NextResponse } from "next/server";
import { isSuperadmin } from "@workspace/db/clinic-service";
import { requireClinicPermission } from "@/src/lib/auth/clinic";
import { automationReport } from "@/src/lib/automation-report";

/** WhatsApp automations, message to money — see src/lib/automation-report. */
export async function GET(req: Request) {
  const context = await requireClinicPermission("ops.reports");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const weeks = Math.min(26, Math.max(1, Number(url.searchParams.get("weeks")) || 8));
  const wantsAll = url.searchParams.get("scope") === "all" && isSuperadmin(context.session.user.role);
  const report = await automationReport({ clinicId: wantsAll ? null : context.clinic.id, weeks, flowId: url.searchParams.get("flowId") });
  return NextResponse.json({ ...report, scope: wantsAll ? "all" : "clinic" });
}
