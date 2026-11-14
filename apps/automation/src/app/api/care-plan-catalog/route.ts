import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { carePlanCatalogItem } from "@workspace/db/schema";
import { asc, eq } from "@workspace/db";
import { orderSlots } from "@workspace/db/care-plan";
import { requireOperations } from "@/src/lib/auth/guards";

/**
 * The clinic's pick-list, read-only.
 *
 * Editing it moved to the clinic panel — a change here alters what every
 * clinician sees for every future patient, which is clinical configuration
 * and not something to run from a leads-and-campaigns console.
 *
 * Reading stays: a coach looking at a patient's adherence needs the catalogue
 * to name what was prescribed, and that is not the same right as changing it.
 * Only active entries, because nothing here can prescribe a retired one.
 */
export async function GET() {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(carePlanCatalogItem)
    .where(eq(carePlanCatalogItem.isActive, true))
    .orderBy(asc(carePlanCatalogItem.type), asc(carePlanCatalogItem.name));

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      defaultInstructions: r.defaultInstructions,
      defaultSlots: orderSlots(r.defaultSlots),
      isActive: r.isActive,
    })),
  });
}
