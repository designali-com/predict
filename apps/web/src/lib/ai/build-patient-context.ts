import { db } from "@workspace/db/client";
import {
  report,
  biomarkerReading,
  biomarker,
  biologicalAgeResult,
  domainAgeResult,
  biomarkerIndex,
  biomarkerDomain,
} from "@workspace/db/schema";
import { desc, eq, inArray } from "@workspace/db";

const MAX_REPORTS = 20;

// Assembles a compact, markdown-formatted snapshot of a single patient's own
// data — their reports, latest biomarker readings, and latest biological-age
// results — for injection into the AI system prompt. Always scoped to the
// given userId, which callers must derive from the authenticated session,
// never from client input, since this becomes model context.
export async function buildPatientContext(userId: string): Promise<string> {
  const [reports, readings, ageResults] = await Promise.all([
    db.query.report.findMany({
      where: eq(report.userId, userId),
      orderBy: [desc(report.uploadedAt)],
      limit: MAX_REPORTS,
    }),
    db.query.biomarkerReading.findMany({
      where: eq(biomarkerReading.userId, userId),
      orderBy: [desc(biomarkerReading.recordedAt)],
    }),
    db.query.biologicalAgeResult.findMany({
      where: eq(biologicalAgeResult.userId, userId),
      orderBy: [desc(biologicalAgeResult.calculatedAt)],
    }),
  ]);

  const reportsSection = formatReports(reports);
  const biomarkersSection = await formatLatestBiomarkerReadings(readings);
  const ageResultsSection = await formatBiologicalAgeResults(ageResults);

  return [reportsSection, biomarkersSection, ageResultsSection].join("\n\n");
}

function formatReports(reports: Array<{ fileName: string | null; reportType: string | null; uploadedAt: Date }>): string {
  if (reports.length === 0) {
    return "## Reports on file\nNone uploaded yet.";
  }
  const lines = reports.map(
    (r) => `- ${r.fileName ?? r.reportType ?? "Report"} — uploaded ${r.uploadedAt.toISOString().slice(0, 10)}`,
  );
  return ["## Reports on file", ...lines].join("\n");
}

async function formatLatestBiomarkerReadings(
  readings: Array<{ biomarkerId: string; value: number; recordedAt: Date }>,
): Promise<string> {
  if (readings.length === 0) {
    return "## Latest biomarker readings\nNone recorded yet.";
  }

  // readings is already ordered by recordedAt desc, so the first occurrence
  // of each biomarkerId is its latest reading.
  const latestByBiomarker = new Map<string, { value: number; recordedAt: Date }>();
  for (const r of readings) {
    if (!latestByBiomarker.has(r.biomarkerId)) {
      latestByBiomarker.set(r.biomarkerId, { value: r.value, recordedAt: r.recordedAt });
    }
  }

  const biomarkerIds = [...latestByBiomarker.keys()];
  const biomarkers = await db.query.biomarker.findMany({
    where: inArray(biomarker.id, biomarkerIds),
  });
  const biomarkerById = new Map(biomarkers.map((b) => [b.id, b]));

  const lines = [...latestByBiomarker.entries()].map(([biomarkerId, { value, recordedAt }]) => {
    const b = biomarkerById.get(biomarkerId);
    const unit = b?.unit ? ` ${b.unit}` : "";
    const range = b?.rangeMin != null && b?.rangeMax != null ? ` (reference range: ${b.rangeMin}-${b.rangeMax}${unit})` : "";
    return `- ${b?.name ?? "Unknown biomarker"}: ${value}${unit} (recorded ${recordedAt.toISOString().slice(0, 10)})${range}`;
  });

  return ["## Latest biomarker readings", ...lines].join("\n");
}

async function formatBiologicalAgeResults(
  results: Array<{
    id: string;
    indexId: string;
    chronologicalAge: number;
    biologicalAge: number;
    deltaAge: number;
    calculatedAt: Date;
  }>,
): Promise<string> {
  if (results.length === 0) {
    return "## Biological age results\nNone calculated yet.";
  }

  // results is already ordered by calculatedAt desc — keep only the latest
  // per category.
  const latestByCategory = new Map<string, (typeof results)[number]>();
  for (const r of results) {
    if (!latestByCategory.has(r.indexId)) {
      latestByCategory.set(r.indexId, r);
    }
  }
  const latestResults = [...latestByCategory.values()];

  const categoryIds = latestResults.map((r) => r.indexId);
  const categories = categoryIds.length
    ? await db.query.biomarkerIndex.findMany({ where: inArray(biomarkerIndex.id, categoryIds) })
    : [];
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const resultIds = latestResults.map((r) => r.id);
  const domainResults = resultIds.length
    ? await db.query.domainAgeResult.findMany({ where: inArray(domainAgeResult.resultId, resultIds) })
    : [];
  const domainIds = [...new Set(domainResults.map((d) => d.domainId))];
  const domains = domainIds.length
    ? await db.query.biomarkerDomain.findMany({ where: inArray(biomarkerDomain.id, domainIds) })
    : [];
  const domainById = new Map(domains.map((d) => [d.id, d]));
  const domainResultsByResultId = new Map<string, typeof domainResults>();
  for (const d of domainResults) {
    const existing = domainResultsByResultId.get(d.resultId) ?? [];
    existing.push(d);
    domainResultsByResultId.set(d.resultId, existing);
  }

  const lines = latestResults.flatMap((r) => {
    const category = categoryById.get(r.indexId);
    const header = `- ${category?.name ?? "Composite score"}: biological age ${r.biologicalAge.toFixed(1)} (chronological ${r.chronologicalAge.toFixed(1)}), ΔAge ${r.deltaAge >= 0 ? "+" : ""}${r.deltaAge.toFixed(1)} — calculated ${r.calculatedAt.toISOString().slice(0, 10)}`;
    const domainLines = (domainResultsByResultId.get(r.id) ?? []).map(
      (d) => `  - ${domainById.get(d.domainId)?.name ?? "Domain"}: contribution ${d.contribution.toFixed(2)}`,
    );
    return [header, ...domainLines];
  });

  return ["## Biological age results", ...lines].join("\n");
}
