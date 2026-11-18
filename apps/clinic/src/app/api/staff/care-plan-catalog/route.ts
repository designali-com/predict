import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { carePlanCatalogItem } from "@workspace/db/schema";
import { asc, eq } from "@workspace/db";
import { CARE_PLAN_ITEM_TYPES, CARE_PLAN_SLOTS, orderSlots } from "@workspace/db/care-plan";
import { requireApiAnyPermission, requireApiPermission } from "@/src/lib/auth/permissions";
import { denyPartner } from "@/src/lib/auth/patient-scope";

const VALID_TYPES = CARE_PLAN_ITEM_TYPES.map((t) => t.value) as string[];
const VALID_SLOTS = CARE_PLAN_SLOTS.map((s) => s.value) as string[];

/**
 * The clinic's pick-list of things it prescribes.
 *
 * Lives in the clinic panel, not the operations console. It was built before
 * this app existed, so it stayed behind when the clinical work moved — which
 * meant a nutritionist had to leave their own panel and open a leads-and-
 * campaigns console to add a supplement.
 *
 * Reading and editing are separated on purpose. Anyone who can assign a plan
 * needs the list in front of them; changing it alters what every clinician
 * sees for every future patient, so that is its own permission and can be
 * handed to one nutritionist without handing it to all of them.
 */
export async function GET(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const session = await requireApiAnyPermission([
    "clinic.care_plan_library",
    "clinic.patients",
    "clinic.appointments",
  ]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  // The picker wants only what can still be prescribed; the Setup screen wants
  // retired entries too, so it can bring one back.
  const includeInactive = url.searchParams.get("includeInactive") === "true";

  const rows = await db
    .select()
    .from(carePlanCatalogItem)
    .where(includeInactive ? undefined : eq(carePlanCatalogItem.isActive, true))
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

export async function POST(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const session = await requireApiPermission("clinic.care_plan_library");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = typeof body?.type === "string" ? body.type : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slots = Array.isArray(body?.defaultSlots)
    ? body.defaultSlots.filter((s: unknown) => VALID_SLOTS.includes(s as string))
    : [];

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Pick a valid type" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  try {
    const [row] = await db
      .insert(carePlanCatalogItem)
      .values({
        type,
        name,
        defaultInstructions:
          typeof body?.defaultInstructions === "string" && body.defaultInstructions
            ? body.defaultInstructions
            : null,
        defaultSlots: orderSlots(slots),
      })
      .returning();
    return NextResponse.json({ item: row }, { status: 201 });
  } catch (err) {
    // The (type, name) unique index — say what happened rather than a 500.
    if ((err as { cause?: { code?: string } })?.cause?.code === "23505") {
      return NextResponse.json(
        { error: `"${name}" is already in the ${type} list.` },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function PATCH(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const session = await requireApiPermission("clinic.care_plan_library");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body?.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body?.defaultInstructions === "string") {
    updates.defaultInstructions = body.defaultInstructions || null;
  }
  // Retiring rather than deleting: plans that already reference this entry
  // keep resolving, and the name a patient was given stays readable.
  if (typeof body?.isActive === "boolean") updates.isActive = body.isActive;
  if (Array.isArray(body?.defaultSlots)) {
    updates.defaultSlots = orderSlots(
      body.defaultSlots.filter((s: unknown) => VALID_SLOTS.includes(s as string)),
    );
  }

  const [row] = await db
    .update(carePlanCatalogItem)
    .set(updates)
    .where(eq(carePlanCatalogItem.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item: row });
}
