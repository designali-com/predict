import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { biologicalAgeResult, biomarkerIndex, patientRecord } from "@workspace/db/schema";
import { and, desc, eq } from "@workspace/db";
import {
  DEFAULT_INDEX_SHORT_CODE,
  listIndexes,
  resolvePatientIndex,
  setPatientIndex,
} from "@workspace/db/patient-index";
import { auth } from "@/src/lib/auth/auth";
import { mayFilePatientReport } from "@/src/lib/auth/clinic";
import { runBiologicalAgeCalculationForPatient } from "@/src/lib/biological-age/run-calculation";
import { guardDiagnosis } from "@/src/lib/auth/patient-scope";

/**
 * The index a patient's biological age is built from — read it, or change it.
 *
 * Changing it recalculates straight away from the readings already on the
 * chart. Otherwise the patient's clock would keep showing the old index
 * until their next blood test, which could be months, and the clinician who
 * made the change would have no way to see what it did.
 *
 * Clinical roles only — the same ones that may file readings. Which model a
 * patient's biological age comes from is a clinical decision, not a desk one.
 */

type Params = { params: Promise<{ id: string }> };

/** The route is opened by chart id in some places and contact id in others. */
async function findChart(id: string) {
  return (
    (await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, id) })) ??
    (await db.query.patientRecord.findFirst({ where: eq(patientRecord.contactId, id) })) ??
    null
  );
}

async function guard() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!(await mayFilePatientReport(session.user.role))) {
    return {
      error: NextResponse.json(
        { error: "You are not allowed to change a patient's biological age index." },
        { status: 403 },
      ),
    };
  }
  return { session };
}

async function describe(chartId: string) {
  const [assigned, options] = await Promise.all([resolvePatientIndex(db, chartId), listIndexes(db)]);

  const latest = assigned
    ? (
        await db
          .select({
            biologicalAge: biologicalAgeResult.biologicalAge,
            chronologicalAge: biologicalAgeResult.chronologicalAge,
            deltaAge: biologicalAgeResult.deltaAge,
            calculatedAt: biologicalAgeResult.calculatedAt,
          })
          .from(biologicalAgeResult)
          .where(and(eq(biologicalAgeResult.patientId, chartId), eq(biologicalAgeResult.indexId, assigned.index.id)))
          .orderBy(desc(biologicalAgeResult.calculatedAt))
          .limit(1)
      )[0] ?? null
    : null;

  return {
    patientId: chartId,
    current: assigned ? { ...assigned.index, isDefault: assigned.isDefault } : null,
    defaultShortCode: DEFAULT_INDEX_SHORT_CODE,
    options,
    latest,
  };
}

export async function GET(_req: Request, { params }: Params) {
  const blocked = await guardDiagnosis((await params).id);
  if (blocked) return blocked;
  const { error } = await guard();
  if (error) return error;

  const chart = await findChart((await params).id);
  if (!chart) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  return NextResponse.json(await describe(chart.id));
}

const bodySchema = z.object({
  /** An index id, or null to put the patient back on the default. */
  indexId: z.string().min(1).nullable(),
});

export async function PATCH(req: Request, { params }: Params) {
  const blocked = await guardDiagnosis((await params).id);
  if (blocked) return blocked;
  const { error } = await guard();
  if (error) return error;

  const chart = await findChart((await params).id);
  if (!chart) return NextResponse.json({ error: "No such patient." }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an index." }, { status: 400 });

  const { indexId } = parsed.data;
  if (indexId) {
    const exists = await db.query.biomarkerIndex.findFirst({ where: eq(biomarkerIndex.id, indexId) });
    if (!exists) return NextResponse.json({ error: "That index no longer exists." }, { status: 400 });
  }

  await setPatientIndex(db, chart.id, indexId);

  // Recalculate now from what is already on the chart. A chart with no
  // readings, or no date of birth, simply has nothing to show yet — the
  // index is still saved, and the next blood test is scored against it.
  let recalculated = false;
  let recalculationNote: string | null = null;
  try {
    const outcomes = await runBiologicalAgeCalculationForPatient({
      patientId: chart.id,
      userId: chart.userId,
    });
    recalculated = outcomes.length > 0;
    if (!recalculated) {
      recalculationNote = "Saved. This patient has no readings for this index's markers yet, so there is nothing to calculate.";
    }
  } catch (err) {
    recalculationNote = `Saved, but not recalculated: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json({ ...(await describe(chart.id)), recalculated, recalculationNote });
}
