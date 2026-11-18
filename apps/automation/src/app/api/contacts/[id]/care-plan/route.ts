import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { carePlanItem, contact, user } from "@workspace/db/schema";
import { and, desc, eq } from "@workspace/db";
import { CARE_PLAN_ITEM_TYPES, CARE_PLAN_SLOTS, orderSlots } from "@workspace/db/care-plan";
import { requireOperations } from "@/src/lib/auth/guards";

const VALID_TYPES = CARE_PLAN_ITEM_TYPES.map((t) => t.value) as string[];
const VALID_SLOTS = CARE_PLAN_SLOTS.map((s) => s.value) as string[];

/** Today as the clinic's local calendar day, never toISOString(). */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const items = await db
    .select({
      id: carePlanItem.id,
      type: carePlanItem.type,
      name: carePlanItem.name,
      instructions: carePlanItem.instructions,
      slots: carePlanItem.slots,
      assignedByUserId: carePlanItem.assignedByUserId,
      assignedByName: user.name,
      assignedRole: carePlanItem.assignedRole,
      startDate: carePlanItem.startDate,
      endDate: carePlanItem.endDate,
      isActive: carePlanItem.isActive,
      createdAt: carePlanItem.createdAt,
    })
    .from(carePlanItem)
    .leftJoin(user, eq(carePlanItem.assignedByUserId, user.id))
    .where(eq(carePlanItem.contactId, id))
    .orderBy(desc(carePlanItem.isActive), desc(carePlanItem.createdAt));

  return NextResponse.json({
    items: items.map((i) => ({ ...i, slots: orderSlots(i.slots) })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const [contactRow] = await db.select().from(contact).where(eq(contact.id, id)).limit(1);
  if (!contactRow) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const type = typeof body?.type === "string" ? body.type : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slots = Array.isArray(body?.slots) ? body.slots.filter((s: unknown) => VALID_SLOTS.includes(s as string)) : [];

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Pick a valid type" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  // Without at least one slot there is no expected dose count, so nothing this
  // item is part of could ever be scored — it would sit in the plan looking
  // prescribed while contributing nothing to adherence.
  if (slots.length === 0) {
    return NextResponse.json({ error: "Pick at least one time of day" }, { status: 400 });
  }

  const [row] = await db
    .insert(carePlanItem)
    .values({
      contactId: id,
      type,
      // Where it came from in the library, for reporting. The name is still
      // copied across rather than read through this: renaming a library entry
      // later must not rewrite what a patient was already told.
      catalogItemId: typeof body?.catalogItemId === "string" && body.catalogItemId ? body.catalogItemId : null,
      name,
      instructions: typeof body?.instructions === "string" && body.instructions ? body.instructions : null,
      slots: orderSlots(slots),
      assignedByUserId: session.user.id,
      // Recorded because a coach, a doctor and a nutritionist prescribe
      // different things, and the patient's list should say which of them
      // put each item on it.
      assignedRole: session.user.role ?? null,
      startDate: typeof body?.startDate === "string" && body.startDate ? body.startDate : todayLocal(),
      endDate: typeof body?.endDate === "string" && body.endDate ? body.endDate : null,
    })
    .returning();

  return NextResponse.json({ item: row }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  // Stopping an item ends it rather than deleting it: the days it was live
  // were scored against it, and removing the row would rewrite that history.
  if (typeof body?.isActive === "boolean") {
    updates.isActive = body.isActive;
    if (!body.isActive && body.endDate === undefined) updates.endDate = todayLocal();
    if (body.isActive) updates.endDate = null;
  }
  if (typeof body?.instructions === "string") updates.instructions = body.instructions || null;
  if (Array.isArray(body?.slots)) {
    const slots = body.slots.filter((s: unknown) => VALID_SLOTS.includes(s as string));
    if (slots.length === 0) {
      return NextResponse.json({ error: "Pick at least one time of day" }, { status: 400 });
    }
    updates.slots = orderSlots(slots);
  }

  const [row] = await db
    .update(carePlanItem)
    .set(updates)
    .where(and(eq(carePlanItem.id, itemId), eq(carePlanItem.contactId, id)))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item: row });
}
