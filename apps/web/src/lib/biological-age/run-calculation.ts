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

export async function getChronologicalAge(userId: string): Promise<number> {
  const patient = await db.query.patientRecord.findFirst({
    where: eq(patientRecord.userId, userId),
  });
  if (!patient?.dateOfBirth) {
    throw new Error(
      "Patient's date of birth is not set — cannot compute chronological age",
    );
  }
  return ageInYears(patient.dateOfBirth);
}

async function runForCategory({
  userId,
  categoryId,
  chronologicalAge,
  reportId,
}: {
  userId: string;
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
          eq(biomarkerReading.userId, userId),
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
      userId,
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
  userId,
  categoryId,
  reportId,
}: {
  userId: string;
  categoryId: string;
  reportId?: string;
}) {
  const chronologicalAge = await getChronologicalAge(userId);
  const outcome = await runForCategory({ userId, categoryId, chronologicalAge, reportId });

  if (!outcome) {
    throw new Error(
      "No mapped domains for this category have any available biomarker data",
    );
  }

  return outcome;
}

export async function runBiologicalAgeCalculationForAllCategories({
  userId,
  reportId,
}: {
  userId: string;
  reportId?: string;
}) {
  const chronologicalAge = await getChronologicalAge(userId);
  const categories = await db.query.biomarkerIndex.findMany();

  const outcomes: { categoryId: string; categoryShortCode: string; outcome: NonNullable<Awaited<ReturnType<typeof runForCategory>>> }[] = [];

  for (const category of categories) {
    const outcome = await runForCategory({
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
