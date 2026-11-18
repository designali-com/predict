import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { medicine } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import {
  forecast,
  MEDICINE_UNITS,
  movementHistory,
  movementsFor,
  recordMovement,
  stockLevels,
  stockReport,
} from "@workspace/db/stock-service";
import { requireApiPermission } from "@/src/lib/auth/permissions";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";

/**
 * The storeroom: what is on the shelf, and what the week ahead will take.
 *
 * Levels and forecast come back together because they are read together — the
 * only useful form of "you have 40 sachets" is next to "the week needs 55".
 *
 * All of it is the active clinic's storeroom: each clinic counts its own
 * shelf, against the one shared list of medicines.
 */
export async function GET(req: Request) {
  const context = await requireClinicApiPermission("clinic.stock");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = context.clinic.id;

  const url = new URL(req.url);
  const medicineId = url.searchParams.get("medicineId");

  // One medicine's ledger — the audit trail behind a balance somebody queries.
  if (medicineId) {
    return NextResponse.json({ movements: await movementsFor(db, clinicId, medicineId) });
  }

  // The full ledger, filtered and paged. Its own view because it is asked
  // months after the fact and must not be capped to the current week.
  if (url.searchParams.get("view") === "history") {
    return NextResponse.json(
      await movementHistory(db, clinicId, {
        medicineId: url.searchParams.get("medicine"),
        kind: url.searchParams.get("kind"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        search: url.searchParams.get("q"),
        limit: Number(url.searchParams.get("limit") ?? 100),
        offset: Number(url.searchParams.get("offset") ?? 0),
      }),
    );
  }

  if (url.searchParams.get("view") === "report") {
    return NextResponse.json({
      report: await stockReport(db, {
        clinicId,
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
      }),
    });
  }

  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 7)));

  return NextResponse.json({
    levels: await stockLevels(db, clinicId),
    forecast: await forecast(db, { clinicId, days }),
    units: MEDICINE_UNITS,
  });
}

/** A movement in or out of the active clinic's shelf. The sign comes from the kind, never from the caller. */
export async function POST(req: Request) {
  const context = await requireClinicApiPermission("clinic.stock");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);

  try {
    const movement = await recordMovement(db, {
      clinicId: context.clinic.id,
      medicineId: String(body?.medicineId ?? ""),
      kind: String(body?.kind ?? ""),
      quantity: Number(body?.quantity ?? 0),
      negative: body?.negative === true,
      batchNo: body?.batchNo,
      expiresOn: body?.expiresOn,
      unitCostInPaise:
        body?.unitCostInRupees === undefined || body?.unitCostInRupees === null || body?.unitCostInRupees === ""
          ? null
          : Math.round(Number(body.unitCostInRupees) * 100),
      note: body?.note,
      actorId: context.session.user.id,
    });
    return NextResponse.json({ movement }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not record that movement") },
      { status: 400 },
    );
  }
}

/** Add a medicine, or change its unit, price, reorder level or per-sitting use. */
export async function PUT(req: Request) {
  const session = await requireApiPermission("clinic.stock");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  const perSitting =
    body?.perSittingQty === "" || body?.perSittingQty === null || body?.perSittingQty === undefined
      ? null
      : Number(body.perSittingQty);

  if (perSitting !== null && (!Number.isFinite(perSitting) || perSitting < 0)) {
    return NextResponse.json({ error: "Per-session use cannot be negative." }, { status: 400 });
  }

  const rate = body?.rate === "" || body?.rate == null ? 0 : Number(body.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    return NextResponse.json({ error: "The price cannot be negative." }, { status: 400 });
  }

  const patch = {
    name,
    sku: body?.sku?.trim() || null,
    unit: MEDICINE_UNITS.includes(body?.unit) ? body.unit : "piece",
    perSittingQty: perSitting,
    reorderLevel: Number(body?.reorderLevel ?? 0) || 0,
    rateInPaise: Math.round(rate * 100),
    isActive: body?.isActive !== false,
    notes: body?.notes?.trim() || null,
    updatedAt: new Date(),
  };

  try {
    if (body?.id) {
      const [updated] = await db
        .update(medicine)
        .set(patch)
        .where(eq(medicine.id, body.id))
        .returning();
      return NextResponse.json({ medicine: updated });
    }

    if (!name) return NextResponse.json({ error: "Give the medicine a name." }, { status: 400 });

    const [created] = await db.insert(medicine).values(patch).returning();
    return NextResponse.json({ medicine: created }, { status: 201 });
  } catch (error) {
    const message = describeError(error, "Could not save that medicine");
    return NextResponse.json(
      {
        error: message.includes("medicine_name_unique")
          ? "A medicine with that name already exists."
          : message,
      },
      { status: 400 },
    );
  }
}
