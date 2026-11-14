import { withReadableUrls } from "@workspace/storage";
import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { biomarker, patientRecord } from "@workspace/db/schema";
import { asc, eq } from "@workspace/db";
import {
  bloodTestOrdersFor,
  createBloodTestOrder,
  clinicToday,
} from "@workspace/db/blood-test";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { describeError } from "@/src/lib/api-error";
import { guardDiagnosis, partnerClinicId } from "@/src/lib/auth/patient-scope";
import { notifyTestPrescribed } from "@/src/lib/lab/notify";

const CAN_USE = ["clinic.patients", "clinic.appointments", "clinic.billing", "clinic.biomarkers"];

async function chartFor(id: string) {
  const [byId] = await db.select().from(patientRecord).where(eq(patientRecord.id, id)).limit(1);
  if (byId) return byId;
  const [byContact] = await db
    .select()
    .from(patientRecord)
    .where(eq(patientRecord.contactId, id))
    .limit(1);
  return byContact ?? null;
}

/**
 * One patient's blood tests: what was ordered, what it cost, what came back.
 *
 * The catalogue rides along so the ordering form can be built without a second
 * request — it is 29 rows, and splitting it would only mean the price list and
 * the orders could disagree about what a marker costs.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await guardDiagnosis((await ctx.params).id);
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_USE);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const chart = await chartFor(id);
  if (!chart) return NextResponse.json({ error: "No such patient" }, { status: 404 });

  const [orders, catalogue] = await Promise.all([
    bloodTestOrdersFor(db, chart.id),
    db.select().from(biomarker).orderBy(asc(biomarker.name)),
  ]);

  return NextResponse.json({
    patientId: chart.id,
    today: clinicToday(),
    // Signed: the reports on each order are private in storage.
    orders: await Promise.all(orders.map(async (o) => ({ ...o, reports: await withReadableUrls(o.reports) }))),
    catalogue: catalogue.map((m) => ({
      id: m.id,
      name: m.name,
      shortCode: m.shortCode,
      unit: m.unit,
      priceInPaise: m.priceInPaise,
    })),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await guardDiagnosis((await ctx.params).id);
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_USE);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const chart = await chartFor(id);
  if (!chart) return NextResponse.json({ error: "No such patient" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const biomarkerIds: string[] = Array.isArray(body?.biomarkerIds)
    ? body.biomarkerIds.map(String)
    : [];

  try {
    const result = await createBloodTestOrder(db, {
      patientId: chart.id,
      biomarkerIds,
      collectedOn: body?.collectedOn ? String(body.collectedOn) : null,
      note: body?.note ? String(body.note) : null,
      actorId: session.user.id,
    });

    // Written at a partner hospital, the patient is not standing at our desk:
    // tell them a Predict blood test is waiting to be booked.
    if (await partnerClinicId()) await notifyTestPrescribed(result.order.id).catch(() => null);

    return NextResponse.json(
      {
        orderId: result.order.id,
        totalInPaise: result.order.totalInPaise,
        itemCount: result.itemCount,
        // Said back rather than hidden: a panel that totals zero because
        // nobody has priced it looks the same as a free one.
        unpricedCount: result.unpricedCount,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not create that blood test") },
      { status: 400 },
    );
  }
}
