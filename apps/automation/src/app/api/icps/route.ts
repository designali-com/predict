import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { leadRule } from "@workspace/db/schema";
import { and, asc, eq } from "@workspace/db";
import { requireOperations } from "@/src/lib/auth/guards";

/**
 * The ICPs, for anyone in the console — the caller's ICP picker, list labels,
 * the flow builder's per-ICP template check. Editing them is Lead routing's
 * job and needs its permission; reading the names does not.
 */
export async function GET() {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({ code: leadRule.interest, name: leadRule.name, active: leadRule.active })
    .from(leadRule)
    .where(and(eq(leadRule.kind, "interest")))
    .orderBy(asc(leadRule.priority), asc(leadRule.createdAt));

  return NextResponse.json({
    icps: rows.filter((r) => r.code).map((r) => ({ code: r.code!, name: r.name, active: r.active })),
  });
}
