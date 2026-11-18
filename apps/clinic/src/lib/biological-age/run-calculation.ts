import { db } from "@workspace/db/client";
import {
  biologicalAgeResult,
  biomarker,
  biomarkerIndex,
  biomarkerReading,
  indexDomainMap,
  domainAgeResult,
  domainBiomarkerMap,
  patientRecord,
} from "@workspace/db/schema";
import { and, desc, eq, inArray } from "@workspace/db";
import { STUB_DATE_OF_BIRTH } from "@workspace/db/registration-sync";
import { resolvePatientIndex } from "@workspace/db/patient-index";
import { refreshPatientPlanForChart } from "@workspace/db/diet-plan-store";
import { calculateBiologicalAge, DomainInput } from "./calculate";

function ageInYears(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * Age from the chart.
 *
 * Takes the chart id, not the account. It always did read the chart — it
 * just had to find it through a login first, which meant no biological age
 * could be calculated for a patient who had never signed up. Most of this
 * clinic's patients have not.
 */
export async function getChronologicalAge(patientId: string): Promise<number> {
  const patient = await db.query.patientRecord.findFirst({
    where: eq(patientRecord.id, patientId),
  });
  // The stub every chart carries from booking until somebody registers the
  // patient is a date, so it passed this check and scored a 126-year-old — a
  // wrong biological age stated with full confidence, which is worse than none.
  if (!patient?.dateOfBirth || patient.dateOfBirth === STUB_DATE_OF_BIRTH) {
    throw new Error(
      "Patient's date of birth is not set — cannot compute chronological age",
    );
  }
  return ageInYears(patient.dateOfBirth);
}

async function runForCategory({
  patientId,
  userId,
  categoryId,
  chronologicalAge,
  reportId,
}: {
  patientId: string;
  /** Stamped alongside the chart when there is a login, so the patient app
   *  can read its own results without joining through the chart. */
  userId?: string | null;
  categoryId: string;
  chronologicalAge: number;
  reportId?: string;
}) {
  const category = await db.query.biomarkerIndex.findFirst({
    where: eq(biomarkerIndex.id, categoryId),
  });
  if (!category) {
    throw new Error("Category not found");
  }

  const categoryDomains = await db.query.indexDomainMap.findMany({
    where: eq(indexDomainMap.indexId, categoryId),
  });

  const domains: DomainInput[] = [];

  for (const link of categoryDomains) {
    const domainBiomarkerLinks = await db.query.domainBiomarkerMap.findMany({
      where: eq(domainBiomarkerMap.domainId, link.domainId),
    });
    const biomarkerIds = domainBiomarkerLinks.map((l) => l.biomarkerId);
    if (biomarkerIds.length === 0) continue;

    const domainBiomarkerRows = await db.query.biomarker.findMany({
      where: inArray(biomarker.id, biomarkerIds),
    });

    const domainBiomarkers = [];
    for (const row of domainBiomarkerRows) {
      if (row.rangeMin == null || row.rangeMax == null) continue;

      const latestReading = await db.query.biomarkerReading.findFirst({
        where: and(
          eq(biomarkerReading.patientId, patientId),
          eq(biomarkerReading.biomarkerId, row.id),
        ),
        orderBy: [desc(biomarkerReading.recordedAt)],
      });
      if (!latestReading) continue;

      domainBiomarkers.push({
        biomarkerId: row.id,
        value: latestReading.value,
        rangeMin: row.rangeMin,
        rangeMax: row.rangeMax,
      });
    }

    if (domainBiomarkers.length === 0) continue;

    // W_d and α_d are computed inside calculateBiologicalAge from the
    // domains' own Mean|Z|_d — not read from config here.
    domains.push({
      domainId: link.domainId,
      biomarkers: domainBiomarkers,
    });
  }

  if (domains.length === 0) {
    return null;
  }

  const result = calculateBiologicalAge({
    chronologicalAge,
    k: category.k,
    domains,
  });

  const [savedResult] = await db
    .insert(biologicalAgeResult)
    .values({
      patientId,
      userId: userId ?? null,
      indexId: categoryId,
      reportId: reportId ?? null,
      chronologicalAge,
      compositeScore: result.compositeScore,
      deltaAge: result.deltaAge,
      biologicalAge: result.biologicalAge,
    })
    .returning();

  if (!savedResult) {
    throw new Error("Failed to save calculation result");
  }

  if (result.domainResults.length > 0) {
    await db.insert(domainAgeResult).values(
      result.domainResults.map((domain) => ({
        resultId: savedResult.id,
        domainId: domain.domainId,
        meanAbsZ: domain.meanAbsZ,
        biomarkerCount: domain.biomarkerCount,
        weightUsed: domain.weightUsed,
        alphaUsed: domain.alphaUsed,
        contribution: domain.contribution,
      })),
    );
  }

  return { result: savedResult, domainResults: result.domainResults };
}

export async function runBiologicalAgeCalculation({
  patientId,
  userId,
  categoryId,
  reportId,
}: {
  patientId: string;
  userId?: string | null;
  categoryId: string;
  reportId?: string;
}) {
  const chronologicalAge = await getChronologicalAge(patientId);
  const outcome = await runForCategory({
    patientId,
    userId,
    categoryId,
    chronologicalAge,
    reportId,
  });

  if (!outcome) {
    throw new Error(
      "No mapped domains for this category have any available biomarker data",
    );
  }

  return outcome;
}

/**
 * Calculate the one index this patient is scored on.
 *
 * What every "readings were saved" path calls. It used to run every index
 * in the catalogue, so each blood test produced five biological ages, and
 * which one the patient saw depended on a setting nobody at the clinic could
 * reach. Now the chart carries its index (default CBLAI) and only that one
 * is scored.
 *
 * Same return shape as ForAllCategories — a list, empty when there was
 * nothing to score — so its callers change a name and nothing else.
 */
export async function runBiologicalAgeCalculationForPatient({
  patientId,
  userId,
  reportId,
}: {
  patientId: string;
  userId?: string | null;
  reportId?: string;
}) {
  const assigned = await resolvePatientIndex(db, patientId);
  if (!assigned) throw new Error("No biological age index exists — create one in Biomarkers first");

  const chronologicalAge = await getChronologicalAge(patientId);
  const outcome = await runForCategory({
    patientId,
    userId,
    categoryId: assigned.index.id,
    chronologicalAge,
    reportId,
  });

  // The plan is made from these results, so it is remade with them. A plan
  // that fails to build must not fail the report the clinic just confirmed.
  try {
    await refreshPatientPlanForChart(db, patientId, { reason: "A new blood report was calculated." });
  } catch (error) {
    console.error("[plan] refresh after calculation failed:", error);
  }

  return outcome
    ? [{ categoryId: assigned.index.id, categoryShortCode: assigned.index.shortCode, outcome }]
    : [];
}

export async function runBiologicalAgeCalculationForAllCategories({
  patientId,
  userId,
  reportId,
}: {
  patientId: string;
  userId?: string | null;
  reportId?: string;
}) {
  const chronologicalAge = await getChronologicalAge(patientId);
  const categories = await db.query.biomarkerIndex.findMany();

  const outcomes: { categoryId: string; categoryShortCode: string; outcome: NonNullable<Awaited<ReturnType<typeof runForCategory>>> }[] = [];

  for (const category of categories) {
    const outcome = await runForCategory({
      patientId,
      userId,
      categoryId: category.id,
      chronologicalAge,
      reportId,
    });
    if (outcome) {
      outcomes.push({ categoryId: category.id, categoryShortCode: category.shortCode, outcome });
    }
  }

  return outcomes;
}
