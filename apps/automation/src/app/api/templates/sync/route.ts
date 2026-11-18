import { NextResponse } from "next/server";
import { requirePermission } from "@/src/lib/auth/guards";
import { syncTemplatesFromMeta } from "@/src/lib/sync-templates-from-meta";

// Backs the refresh button on the templates list — pulls each template's
// current status/category/quality from the WABA. POST rather than GET
// because it writes.
export async function POST() {
  const session = await requirePermission("ops.templates");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await syncTemplatesFromMeta();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json(result);
}
