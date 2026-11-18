import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth/auth";
import { headers } from "next/headers";
import { db } from "@workspace/db/client";
import { carePlanCatalogItem, carePlanItem, contact, user } from "@workspace/db/schema";
import { and, asc, desc, eq } from "@workspace/db";
import { CARE_PLAN_ITEM_TYPES, CARE_PLAN_SLOTS, orderSlots } from "@workspace/db/care-plan";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { guardPatient } from "@/src/lib/auth/patient-scope";

const VALID_TYPES = CARE_PLAN_ITEM_TYPES.map((t) => t.value) as string[];
const VALID_SLOTS = CARE_PLAN_SLOTS.map((s) => s.value) as string[];

/** Today as a local calendar day — toISOString() renders UTC. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The care team's half of the care plan.
 *
 * Health coaches assign from the operations console; doctors and
 * nutritionists assign here, where they already have the chart open. The two
 * consoles render it differently on purpose, but both write the same table and
 * both take their vocabulary — types, slots, how a dose is scored — from
 * @workspace/db/care-plan, so a patient's plan reads the same either way.
 *
 * Addressed by userId because that is what this app's patient pages carry;
 * the plan itself hangs off contact, which is the row a walk-in has even
 * without a login.
 */
async function requireCareTeam() {
  return requireApiAnyPermission([
    "clinic.patients",
    "clinic.appointments",
    "clinic.care_plan_library",
  ]);
}

async function contactIdForUser(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(eq(contact.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

export async function GET(req: Request) {
  const session = await requireCareTeam();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = new URL(req.url).searchParams.get("userId");
  {
    const blocked = await guardPatient(userId);
    if (blocked) return blocked;
  }
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const contactId = await contactIdForUser(userId);
  // Not an error: a patient account with no contact row simply has no plan
  // yet. Saying so lets the panel offer to create one rather than break.
  if (!contactId) return NextResponse.json({ contactId: null, items: [] });

  const items = await db
    .select({
      id: carePlanItem.id,
      type: carePlanItem.type,
      name: carePlanItem.name,
      instructions: carePlanItem.instructions,
      slots: carePlanItem.slots,
      assignedByName: user.name,
      assignedRole: carePlanItem.assignedRole,
      startDate: carePlanItem.startDate,
      endDate: carePlanItem.endDate,
      isActive: carePlanItem.isActive,
    })
    .from(carePlanItem)
    .leftJoin(user, eq(carePlanItem.assignedByUserId, user.id))
    .where(eq(carePlanItem.contactId, contactId))
    .orderBy(desc(carePlanItem.isActive), desc(carePlanItem.createdAt));

  // The pick-list travels with the plan: the panel needs both to render, and
  // one round trip is one fewer thing to keep in sync.
  const catalog = await db
    .select({
      id: carePlanCatalogItem.id,
      type: carePlanCatalogItem.type,
      name: carePlanCatalogItem.name,
      defaultInstructions: carePlanCatalogItem.defaultInstructions,
      defaultSlots: carePlanCatalogItem.defaultSlots,
    })
    .from(carePlanCatalogItem)
    .where(eq(carePlanCatalogItem.isActive, true))
    .orderBy(asc(carePlanCatalogItem.type), asc(carePlanCatalogItem.name));

  return NextResponse.json({
    contactId,
    items: items.map((i) => ({ ...i, slots: orderSlots(i.slots) })),
    catalog: catalog.map((c) => ({ ...c, defaultSlots: orderSlots(c.defaultSlots) })),
  });
}

export async function POST(req: Request) {
  const session = await requireCareTeam();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  {
    const blocked = await guardPatient(userId);
    if (blocked) return blocked;
  }
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const contactId = await contactIdForUser(userId);
  if (!contactId) {
    return NextResponse.json(
      { error: "This account has no contact record, so nothing can be assigned to it yet." },
      { status: 400 },
    );
  }

  const type = typeof body?.type === "string" ? body.type : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slots = Array.isArray(body?.slots)
    ? body.slots.filter((s: unknown) => VALID_SLOTS.includes(s as string))
    : [];

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Pick a valid type" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  // Without a slot there is no expected dose count, so the item would sit in
  // the plan looking prescribed while contributing nothing to adherence.
  if (slots.length === 0) {
    return NextResponse.json({ error: "Pick at least one time of day" }, { status: 400 });
  }

  const [row] = await db
    .insert(carePlanItem)
    .values({
      contactId,
      type,
      catalogItemId:
        typeof body?.catalogItemId === "string" && body.catalogItemId ? body.catalogItemId : null,
      name,
      instructions:
        typeof body?.instructions === "string" && body.instructions ? body.instructions : null,
      slots: orderSlots(slots),
      assignedByUserId: session.user.id,
      assignedRole: session.user.role ?? null,
      startDate: todayLocal(),
    })
    .returning();

  return NextResponse.json({ item: row }, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await requireCareTeam();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  {
    const [owner] = await db.select({ contactId: carePlanItem.contactId }).from(carePlanItem).where(eq(carePlanItem.id, itemId)).limit(1);
    const blocked = await guardPatient(owner?.contactId ?? null);
    if (blocked) return blocked;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  // Stopping ends the item rather than deleting it: the days it was live were
  // scored against it, and removing the row would rewrite that history.
  if (typeof body?.isActive === "boolean") {
    updates.isActive = body.isActive;
    updates.endDate = body.isActive ? null : todayLocal();
  }

  const [row] = await db
    .update(carePlanItem)
    .set(updates)
    .where(and(eq(carePlanItem.id, itemId)))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item: row });
}
