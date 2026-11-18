import { NextResponse } from "next/server";
import { requirePermission } from "@/src/lib/auth/guards";
import { sendCampaignBatch } from "@/src/campaign-send";

// One batch per request, with the page asking again until nothing is pending.
// A single request that tried to push nine hundred messages would outlive any
// serverless timeout and leave no record of where it stopped. Scheduled
// campaigns do not come through here — the worker sends those.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.campaigns");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await sendCampaignBatch((await params).id, session.user.id);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}
