import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { previewRouting } from "@workspace/db/lead-routing";
import { requirePermission } from "@/src/lib/auth/guards";

/**
 * "If a lead like this came in now, what would happen?" — which rules match,
 * where we think the lead is, without assigning anyone or moving a
 * round-robin cursor.
 */
export async function POST(req: Request) {
  const session = await requirePermission("ops.lead_routing");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" && b[k] ? (b[k] as string) : null);

  const result = await previewRouting(db, {
    city: str("city"),
    state: str("state"),
    pincode: str("pincode"),
    adsetName: str("adsetName"),
    campaignName: str("campaignName"),
    adName: str("adName"),
    formName: str("formName"),
  });
  return NextResponse.json({
    assign: result.assign && {
      name: result.assign.rule.name,
      routedBy: result.assign.routedBy,
      distanceKm: result.assign.distanceKm,
      hub: result.assign.rule.hubLabel,
    },
    location: result.location && { label: result.location.label, from: result.location.from },
    icp: result.interestRule && { name: result.interestRule.name, code: result.interestRule.interest },
  });
}
