import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { biomarker, biomarkerReading, patientRecord, report } from "@workspace/db/schema";
import { and, asc, desc, eq, inArray, or } from "@workspace/db";
import { bloodTestOrdersFor, markReported } from "@workspace/db/blood-test";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { describeError } from "@/src/lib/api-error";
import { runBiologicalAgeCalculationForPatient } from "@/src/lib/biological-age/run-calculation";
import { guardDiagnosis } from "@/src/lib/auth/patient-scope";
import { notifyReportReady } from "@/src/lib/lab/notify";
import { recordOrderEvent } from "@workspace/db/lab-orders";
import { CLINIC_URL } from "@/src/lib/auth/config";

const CAN_ENTER = ["clinic.biomarkers", "clinic.patients", "clinic.appointments", "clinic.lab"];

/**
 * Blood values typed in by hand, or pre-filled from an uploaded/parsed report.
 *
 * Most panels arrive as a printout or a WhatsApp photo, or as a machine-
 * readable PDF where only a subset of biomarkers could be parsed automatically.
 * When opening this screen, values parsed from the most recent blood report
 * or selected test order are auto-fetched so staff only needs to manually
 * enter the missing ones, avoiding duplicate data entry.
 *
 * Keyed on the chart, so it works for a patient who has never opened the app.
 */
export async function GET(req: Request) {
  const session = await requireApiAnyPermission(CAN_ENTER);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patientId = new URL(req.url).searchParams.get("patientId");
  {
    const blocked = await guardDiagnosis(patientId);
    if (blocked) return blocked;
  }

  const [chart] = patientId
    ? await db
        .select()
        .from(patientRecord)
        .where(eq(patientRecord.id, patientId))
        .limit(1)
    : [];

  // One flat list, straight from the biomarker table. Whoever is typing is
  // reading down a lab printout, and the domains a marker rolls up into are a
  // fact about the score, not about the sheet in their hand.
  const markers = await db.select().from(biomarker).orderBy(asc(biomarker.name));

  // The last value for each marker, so somebody entering today's panel can see
  // what it was last time without leaving the form.
  const previous = patientId
    ? await db
        .select()
        .from(biomarkerReading)
        .where(eq(biomarkerReading.patientId, patientId))
        .orderBy(desc(biomarkerReading.recordedAt))
    : [];

  const lastByMarker = new Map<string, (typeof previous)[number]>();
  for (const row of previous) {
    if (!lastByMarker.has(row.biomarkerId)) lastByMarker.set(row.biomarkerId, row);
  }

  // The tests this patient was actually billed for, so whoever is typing can
  // say which draw these numbers came off rather than leaving them floating
  // with only a date.
  const orders = patientId ? await bloodTestOrdersFor(db, patientId) : [];
  const orderIds = orders.map((o) => o.id);

  // Collect readings associated with these orders
  const orderReadings =
    orderIds.length > 0
      ? await db
          .select()
          .from(biomarkerReading)
          .where(inArray(biomarkerReading.bloodTestOrderId, orderIds))
      : [];

  const readingsByOrder = new Map<string, Record<string, number>>();
  for (const r of orderReadings) {
    if (!r.bloodTestOrderId) continue;
    const m = readingsByOrder.get(r.bloodTestOrderId) ?? {};
    m[r.biomarkerId] = r.value;
    readingsByOrder.set(r.bloodTestOrderId, m);
  }

  // Look for reports uploaded for this patient
  const reports = chart
    ? await db
        .select()
        .from(report)
        .where(
          chart.userId
            ? or(eq(report.patientId, chart.id), eq(report.userId, chart.userId))
            : eq(report.patientId, chart.id),
        )
        .orderBy(desc(report.uploadedAt))
        .limit(10)
    : [];

  let recentUpload: {
    reportId: string;
    fileName: string | null;
    reportType: string | null;
    uploadedAt: string;
    collectedOn: string | null;
    bloodTestOrderId: string | null;
    values: Record<string, number>;
    markerCount: number;
  } | null = null;

  for (const rep of reports) {
    const reportReadings = await db
      .select()
      .from(biomarkerReading)
      .where(eq(biomarkerReading.reportId, rep.id));

    if (reportReadings.length > 0) {
      const valMap: Record<string, number> = {};
      for (const r of reportReadings) {
        valMap[r.biomarkerId] = r.value;
      }
      recentUpload = {
        reportId: rep.id,
        fileName: rep.fileName,
        reportType: rep.reportType,
        uploadedAt: rep.uploadedAt.toISOString(),
        collectedOn: rep.collectedOn ?? reportReadings[0]?.collectedOn ?? null,
        bloodTestOrderId: rep.bloodTestOrderId ?? reportReadings[0]?.bloodTestOrderId ?? null,
        values: valMap,
        markerCount: reportReadings.length,
      };
      break;
    }
  }

  // If no report had explicit reportId on readings, check if any recent report matches an order with readings
  if (!recentUpload && reports.length > 0) {
    for (const rep of reports) {
      if (rep.bloodTestOrderId && readingsByOrder.has(rep.bloodTestOrderId)) {
        const valMap = readingsByOrder.get(rep.bloodTestOrderId)!;
        if (Object.keys(valMap).length > 0) {
          recentUpload = {
            reportId: rep.id,
            fileName: rep.fileName,
            reportType: rep.reportType,
            uploadedAt: rep.uploadedAt.toISOString(),
            collectedOn: rep.collectedOn,
            bloodTestOrderId: rep.bloodTestOrderId,
            values: valMap,
            markerCount: Object.keys(valMap).length,
          };
          break;
        }
      }
    }
  }

  // Determine latestPanel from previous readings as fallback
  let latestPanel: {
    collectedOn: string;
    reportId: string | null;
    bloodTestOrderId: string | null;
    values: Record<string, number>;
    markerCount: number;
  } | null = null;

  if (previous.length > 0) {
    const latestRow = previous[0];
    if (latestRow) {
      const targetDay = latestRow.collectedOn ?? latestRow.recordedAt.toISOString().slice(0, 10);
      const panelRows = previous.filter(
        (r) => (r.collectedOn ?? r.recordedAt.toISOString().slice(0, 10)) === targetDay,
      );
      const panelVals: Record<string, number> = {};
      for (const r of panelRows) {
        if (panelVals[r.biomarkerId] === undefined) {
          panelVals[r.biomarkerId] = r.value;
        }
      }
      latestPanel = {
        collectedOn: targetDay,
        reportId: latestRow.reportId,
        bloodTestOrderId: latestRow.bloodTestOrderId,
        values: panelVals,
        markerCount: Object.keys(panelVals).length,
      };
    }
  }

  return NextResponse.json({
    orders: orders
      .filter((o) => !o.cancelledAt)
      .map((o) => ({
        id: o.id,
        orderedOn: o.orderedOn,
        collectedOn: o.collectedOn,
        status: o.status,
        biomarkerIds: o.items.map((i) => i.biomarkerId),
        resultsIn: o.resultsIn,
        itemCount: o.items.length,
        values: readingsByOrder.get(o.id) ?? {},
        reportId: o.reports[0]?.id ?? null,
      })),
    biomarkers: markers.map((m) => {
      const last = lastByMarker.get(m.id);
      return {
        id: m.id,
        name: m.name,
        shortCode: m.shortCode,
        unit: m.unit,
        rangeMin: m.rangeMin,
        rangeMax: m.rangeMax,
        direction: m.direction,
        priceInPaise: m.priceInPaise,
        lastValue: last?.value ?? null,
        lastOn: last?.collectedOn ?? null,
      };
    }),
    recentUpload,
    latestPanel,
  });
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const session = await requireApiAnyPermission(CAN_ENTER);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const patientId = String(body?.patientId ?? "");
  {
    const blocked = await guardDiagnosis(patientId);
    if (blocked) return blocked;
  }
  const collectedOn = String(body?.collectedOn ?? "");
  const bloodTestOrderId = body?.bloodTestOrderId ? String(body.bloodTestOrderId) : null;
  const reportId = body?.reportId ? String(body.reportId) : null;

  if (!patientId) return NextResponse.json({ error: "Which patient?" }, { status: 400 });
  if (!DATE_ONLY.test(collectedOn)) {
    return NextResponse.json({ error: "Pick the date the blood was drawn." }, { status: 400 });
  }

  const entries: { biomarkerId: string; value: number }[] = Array.isArray(body?.values)
    ? body.values
        .map((v: { biomarkerId?: string; value?: unknown }) => ({
          biomarkerId: String(v?.biomarkerId ?? ""),
          value: Number(v?.value),
        }))
        // A blank box is not a zero. Somebody entering six markers off a
        // printout must not have the other twenty-three recorded as 0, which
        // would read as catastrophic on every one of them.
        .filter((v: { biomarkerId: string; value: number }) => v.biomarkerId && Number.isFinite(v.value))
    : [];

  if (!entries.length) {
    return NextResponse.json({ error: "Enter at least one value." }, { status: 400 });
  }

  try {
    const [chart] = await db
      .select()
      .from(patientRecord)
      .where(eq(patientRecord.id, patientId))
      .limit(1);

    if (!chart) return NextResponse.json({ error: "No such patient" }, { status: 404 });

    const known = await db
      .select({ id: biomarker.id })
      .from(biomarker)
      .where(inArray(biomarker.id, entries.map((e) => e.biomarkerId)));

    const valid = entries.filter((e) => known.some((k) => k.id === e.biomarkerId));
    if (!valid.length) {
      return NextResponse.json({ error: "None of those are known biomarkers." }, { status: 400 });
    }

    // Find any existing readings that belong to this set/panel so we update rather
    // than duplicating rows for biomarkers that were already parsed from the upload.
    const orConditions = [eq(biomarkerReading.collectedOn, collectedOn)];
    if (reportId) {
      orConditions.push(eq(biomarkerReading.reportId, reportId));
    }
    if (bloodTestOrderId) {
      orConditions.push(eq(biomarkerReading.bloodTestOrderId, bloodTestOrderId));
    }

    const existingInSet = await db
      .select()
      .from(biomarkerReading)
      .where(and(eq(biomarkerReading.patientId, chart.id), or(...orConditions)));

    const existingByBiomarker = new Map<string, (typeof existingInSet)[number]>();
    const duplicateIdsToDelete: string[] = [];

    for (const r of existingInSet) {
      if (!existingByBiomarker.has(r.biomarkerId)) {
        existingByBiomarker.set(r.biomarkerId, r);
      } else {
        duplicateIdsToDelete.push(r.id);
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      await db.delete(biomarkerReading).where(inArray(biomarkerReading.id, duplicateIdsToDelete));
    }

    const toInsert: (typeof biomarkerReading.$inferInsert)[] = [];
    let updatedCount = 0;

    for (const item of valid) {
      const existing = existingByBiomarker.get(item.biomarkerId);
      if (existing) {
        await db
          .update(biomarkerReading)
          .set({
            value: item.value,
            collectedOn,
            bloodTestOrderId: bloodTestOrderId ?? existing.bloodTestOrderId,
            reportId: reportId ?? existing.reportId,
            recordedAt: new Date(`${collectedOn}T12:00:00+05:30`),
          })
          .where(eq(biomarkerReading.id, existing.id));
        updatedCount++;
      } else {
        toInsert.push({
          patientId: chart.id,
          userId: chart.userId,
          biomarkerId: item.biomarkerId,
          value: item.value,
          collectedOn,
          bloodTestOrderId,
          reportId,
          recordedAt: new Date(`${collectedOn}T12:00:00+05:30`),
        });
      }
    }

    const inserted =
      toInsert.length > 0
        ? await db.insert(biomarkerReading).values(toInsert).returning()
        : [];

    // Tie the report to the collection date and blood test order if given
    if (reportId) {
      await db
        .update(report)
        .set({
          collectedOn,
          ...(bloodTestOrderId ? { bloodTestOrderId } : {}),
        })
        .where(eq(report.id, reportId));
    }

    // The order has results now, so it stops reading as still outstanding.
    if (bloodTestOrderId) {
      await markReported(db, bloodTestOrderId);
      await recordOrderEvent(db, bloodTestOrderId, "reported", session.user.id).catch(() => null);
    await notifyReportReady(bloodTestOrderId, CLINIC_URL).catch(() => null);
    }

    // Reported rather than thrown: the values are saved either way, and a
    // panel too thin to score is a normal thing to enter.
    let biologicalAge: { indexShortCode: string; biologicalAge: number; deltaAge: number }[] = [];
    let scoreError: string | null = null;

    try {
      const outcomes = await runBiologicalAgeCalculationForPatient({
        patientId: chart.id,
        userId: chart.userId,
        reportId: reportId ?? undefined,
      });
      biologicalAge = outcomes.map((o) => ({
        indexShortCode: o.categoryShortCode,
        biologicalAge: o.outcome.result.biologicalAge,
        deltaAge: o.outcome.result.deltaAge,
      }));
    } catch (error) {
      scoreError = describeError(error, "Biological age could not be calculated");
    }

    return NextResponse.json(
      {
        saved: updatedCount + inserted.length,
        updated: updatedCount,
        inserted: inserted.length,
        biologicalAge,
        scoreError,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not save those values") },
      { status: 400 },
    );
  }
}

