import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { addExtraItem, removeExtraItem } from "@workspace/db/enrollment-service";
import { requireAnyPermission } from "@/src/lib/auth/guards";

const CAN_BILL = ["ops.leads", "ops.patients"];

/**
 * Extra medicine, dispensed on top of the package.
 *
 * "If your body requires extra medicine then you have to buy extra flat cost" —
 * the note at the bottom of the clinic's own package sheet. These are recorded
 * against the course and flagged as extras rather than edited into the package
 * lines, so the price the patient agreed to stays quotable and the two totals
 * can be read apart.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(CAN_BILL);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  try {
    const item = await addExtraItem(db, {
      enrollmentId: id,
      name: String(body?.name ?? ""),
      // Rupees at the form, paise in the column.
      rateInPaise: Math.round(Number(body?.rateInRupees ?? 0) * 100),
      quantity: Number(body?.quantity ?? 1),
      actorId: session.user.id,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add that" },
      { status: 400 },
    );
  }
}

/** Only extras can be removed — the package lines are what was agreed. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(CAN_BILL);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await params;
  const itemId = new URL(req.url).searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  await removeExtraItem(db, itemId);
  return NextResponse.json({ ok: true });
}
