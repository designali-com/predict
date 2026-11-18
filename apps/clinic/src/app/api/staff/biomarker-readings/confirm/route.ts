import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { biomarker, biomarkerReading, patientRecord } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { runBiologicalAgeCalculationForPatient } from "@/src/lib/biological-age/run-calculation";
import { mayFilePatientReport } from "@/src/lib/auth/clinic";
import { convertConcentration } from "@/src/lib/pdf/unit-conversion";
import { guardDiagnosis } from "@/src/lib/auth/patient-scope";
import { markReported } from "@workspace/db/blood-test";
import { notifyReportReady } from "@/src/lib/lab/notify";
import { recordOrderEvent } from "@workspace/db/lab-orders";
import { CLINIC_URL } from "@/src/lib/auth/config";

/**
 * Save the biomarker values a person has just checked against the PDF.
 *
 * Separate from /from-parsed-report on purpose. That route takes the
 * parser's raw output and writes it — which means a misread number becomes a
 * reading, and then a biological age, with nobody having looked at it. This
 * one takes a list somebody confirmed on screen: every value here was either
 * read off the sheet and approved, or typed in by hand.
 *
 * Rows arrive keyed by the catalogue's own short code rather than a parser
 * key, so the mapping is settled in the browser, where the person could see
 * which marker they were approving.
 */

const bodySchema = z.object({
  reportId: z.string().optional().nullable(),
  /** The account, when the patient has one. */
  patientId: z.string().optional().nullable(),
  /** The chart. Every patient has one; a login is optional. */
  chartId: z.string().optional().nullable(),
  bloodTestOrderId: z.string().optional().nullable(),
  /** The draw date off the sheet — not the day somebody typed it in. */
  collectedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "collectedOn must be yyyy-mm-dd")
    .optional()
    .nullable(),
  readings: z
    .array(
      z.object({
        shortCode: z.string().min(1),
        value: z.number().finite(),
        /** The unit as printed on the sheet, for conversion. */
        unit: z.string().optional().nullable(),
      }),
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json(
      { error: "Not signed in — your session has expired. Sign in again and retry." },
      { status: 401 },
    );
  }

  if (!(await mayFilePatientReport(session.user.role))) {
    return NextResponse.json(
      { error: "You are not allowed to file readings for a patient." },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { reportId, patientId, chartId, bloodTestOrderId, collectedOn, readings } = parsed.data;
  {
    const blocked = await guardDiagnosis(chartId ?? patientId ?? null);
    if (blocked) return blocked;
  }

  // Readings hang off the chart — a walk-in with no login still has one, and
  // is the commonest case at the desk.
  const chart = chartId
    ? await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, chartId) })
    : patientId
      ? await db.query.patientRecord.findFirst({ where: eq(patientRecord.userId, patientId) })
      : null;

  if (!chart) {
    return NextResponse.json(
      { error: "No patient chart to file these readings against." },
      { status: 400 },
    );
  }

  const catalogue = await db.query.biomarker.findMany();
  const byShortCode = new Map(catalogue.map((b) => [b.shortCode.toLowerCase(), b]));

  const toInsert: (typeof biomarkerReading.$inferInsert)[] = [];
  const skipped: { shortCode: string; reason: string }[] = [];

  for (const row of readings) {
    const marker = byShortCode.get(row.shortCode.toLowerCase());
    if (!marker) {
      skipped.push({ shortCode: row.shortCode, reason: "No biomarker with that short code" });
      continue;
    }

    let value = row.value;

    // The sheet's unit and the catalogue's unit often differ. Everything
    // downstream assumes the catalogue's, so convert here — and when the two
    // are not a convertible mass/volume pair, skip the row rather than
    // storing a number that means something else.
    if (row.unit && marker.unit) {
      const conversion = convertConcentration(value, row.unit, marker.unit);
      if (conversion.reason) {
        skipped.push({ shortCode: row.shortCode, reason: conversion.reason });
        continue;
      }
      value = conversion.value;
    }

    toInsert.push({
      patientId: chart.id,
      userId: chart.userId ?? patientId ?? null,
      reportId: reportId ?? null,
      bloodTestOrderId: bloodTestOrderId ?? null,
      collectedOn: collectedOn ?? null,
      biomarkerId: marker.id,
      value,
    });
  }

  const savedReadings = toInsert.length
    ? await db.insert(biomarkerReading).values(toInsert).returning()
    : [];

  let calculationResults: Awaited<
    ReturnType<typeof runBiologicalAgeCalculationForPatient>
  > = [];
  let calculationError: string | null = null;

  if (savedReadings.length) {
    try {
      calculationResults = await runBiologicalAgeCalculationForPatient({
        patientId: chart.id,
        userId: chart.userId ?? patientId ?? null,
        reportId: reportId ?? undefined,
      });
    } catch (error) {
      // The readings are saved either way. A calculation that cannot run —
      // no date of birth yet, say — must not throw away values somebody has
      // just checked line by line.
      calculationError = error instanceof Error ? error.message : "Calculation failed";
    }
  }

  // The order behind this report has its results now: it reads as reported
  // everywhere (the lab, the chart), and the doctor who wrote it hears.
  if (savedReadings.length && bloodTestOrderId) {
    await markReported(db, bloodTestOrderId);
    await recordOrderEvent(db, bloodTestOrderId, "reported", session.user.id).catch(() => null);
    await notifyReportReady(bloodTestOrderId, CLINIC_URL).catch(() => null);
  }

  return NextResponse.json({ savedReadings, skipped, calculationResults, calculationError });
}
