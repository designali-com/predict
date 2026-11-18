import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { biomarker, biomarkerReading } from "@workspace/db/schema";
import { LEGACY_KEY_TO_SHORT_CODE } from "@/src/lib/biological-age/legacy-biomarker-map";
import { runBiologicalAgeCalculationForAllCategories } from "@/src/lib/biological-age/run-calculation";
import { canReadAnotherPatient } from "@/src/lib/auth/config";
import { convertConcentration } from "@/src/lib/pdf/unit-conversion";

const bodySchema = z.object({
  reportId: z.string().optional().nullable(),
  patientId: z.string().optional().nullable(),
  parsed: z.record(
    z.string(),
    z.object({ value: z.number().nullable(), unit: z.string().nullable().optional() }),
  ),
});

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { reportId, patientId, parsed: parsedReport } = parsed.data;

  if (patientId && !canReadAnotherPatient()) {
    return NextResponse.json(
      { error: "You are not allowed to submit readings for other users" },
      { status: 403 },
    );
  }

  const userId = patientId || session.user.id;

  const allBiomarkers = await db.query.biomarker.findMany();
  const biomarkerByShortCode = new Map(
    allBiomarkers.map((b) => [b.shortCode.toLowerCase(), b]),
  );

  const readingsToInsert: { userId: string; reportId: string | null; biomarkerId: string; value: number }[] = [];
  const unmatchedKeys: string[] = [];
  const unitMismatches: { key: string; reportUnit: string; expectedUnit: string; reason: string }[] = [];

  for (const [key, entry] of Object.entries(parsedReport)) {
    if (entry.value == null) continue;

    const shortCode = LEGACY_KEY_TO_SHORT_CODE[key];
    const matchedBiomarker = shortCode
      ? biomarkerByShortCode.get(shortCode.toLowerCase())
      : undefined;

    if (!matchedBiomarker) {
      unmatchedKeys.push(key);
      continue;
    }

    let value = entry.value;

    // The report's unit and the superadmin-configured unit for this
    // biomarker often differ. The calculation downstream assumes every
    // reading is already in the configured unit, so convert here — and if
    // the two units aren't a convertible mass/volume pair (e.g. ng/mL vs
    // U/L), skip saving this reading rather than storing a wrong number.
    if (entry.unit && matchedBiomarker.unit) {
      const conversion = convertConcentration(value, entry.unit, matchedBiomarker.unit);
      if (conversion.reason) {
        unitMismatches.push({
          key,
          reportUnit: entry.unit,
          expectedUnit: matchedBiomarker.unit,
          reason: conversion.reason,
        });
        continue;
      }
      value = conversion.value;
    }

    readingsToInsert.push({
      userId,
      reportId: reportId ?? null,
      biomarkerId: matchedBiomarker.id,
      value,
    });
  }

  const savedReadings =
    readingsToInsert.length > 0
      ? await db.insert(biomarkerReading).values(readingsToInsert).returning()
      : [];

  let calculationResults: Awaited<ReturnType<typeof runBiologicalAgeCalculationForAllCategories>> = [];
  let calculationError: string | null = null;

  try {
    calculationResults = await runBiologicalAgeCalculationForAllCategories({
      userId,
      reportId: reportId ?? undefined,
    });
  } catch (error) {
    // Readings are saved either way — a calculation failure (e.g. date of
    // birth not set yet) shouldn't fail the whole upload.
    calculationError = error instanceof Error ? error.message : "Calculation failed";
  }

  return NextResponse.json({
    savedReadings,
    unmatchedKeys,
    unitMismatches,
    calculationResults,
    calculationError,
  });
}
