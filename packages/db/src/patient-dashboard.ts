import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  biologicalAgeResult,
  biomarker,
  biomarkerDomain,
  biomarkerIndex,
  biomarkerReading,
  domainAgeResult,
  domainBiomarkerMap,
  indexDomainMap,
  patientRecord,
} from "./schema";
import { bandForScore, parseRiskBands, type RiskBand } from "./risk-bands";
import { resolvePatientIndex } from "./patient-index";
import type * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

/**
 * Everything the patient dashboard shows, read out of one place.
 *
 * The dashboard used to be a page of typed-in numbers — a biological age of
 * 52, a radar of nineteen markers nobody had measured, a score for every
 * domain that exists. That is worse than an empty screen: a patient cannot
 * tell an invented number from their own.
 *
 * So every figure here comes from a stored row, and a domain the patient has
 * no readings for is returned as *absent*, never as a zero. Absent and zero
 * read the same on a chart and mean opposite things.
 *
 * Nothing is recalculated. biological_age_result and domain_age_result are
 * snapshots taken when the panel was run; recomputing them here would quietly
 * disagree with the result the clinician saw, the moment a range is edited.
 */

export type Severity = "normal" | "mild" | "moderate" | "severe" | "extreme";

export type BiomarkerStatus = "High" | "Low" | "Normal" | "Unknown";

export interface DashboardBiomarker {
  id: string;
  shortCode: string;
  name: string;
  unit: string | null;
  value: number;
  rangeMin: number | null;
  rangeMax: number | null;
  /** true = a higher value drives biological age up. */
  direction: boolean;
  /** Null when the marker has no reference range configured. */
  z: number | null;
  status: BiomarkerStatus;
  severity: Severity | null;
  collectedOn: string | null;
  recordedAt: string;
}

export interface DashboardDomain {
  id: string;
  shortCode: string;
  name: string;
  description: string | null;
  /** Null when this domain belongs to the index but has no readings. */
  meanAbsZ: number | null;
  biomarkerCount: number;
  weightUsed: number | null;
  alphaUsed: number | null;
  contribution: number | null;
  /** Share of this index's ΔAge, 0–1. Null when not measured. */
  shareOfDelta: number | null;
  severity: Severity | null;
  band: RiskBand | null;
  measured: boolean;
  /** Only the markers in this domain that actually have a reading. */
  biomarkers: DashboardBiomarker[];
  /** Short codes of this domain's markers that were never measured. */
  missing: string[];
}

export interface DashboardIndex {
  id: string;
  shortCode: string;
  name: string;
  resultId: string;
  chronologicalAge: number;
  biologicalAge: number;
  deltaAge: number;
  compositeScore: number;
  band: RiskBand | null;
  calculatedAt: string;
  /** Measured domains first, largest contribution first. */
  domains: DashboardDomain[];
  measuredDomains: number;
  mappedDomains: number;
}

export interface PatientDashboard {
  patient: { userId: string | null; patientId: string | null; name: string | null };
  indexes: DashboardIndex[];
  /** Latest reading per biomarker, furthest from range first. */
  biomarkers: DashboardBiomarker[];
  inRange: number;
  measured: number;
  /** Most recent draw date we know about, ISO date or null. */
  lastPanelOn: string | null;
}

/** |Z| ≤ 2 is inside the reference range, because sd is a quarter of it. */
export const IN_RANGE_Z = 2;

/**
 * Severity from |Z|, used for colour when nobody has configured risk bands.
 *
 * Deliberately the same 0/1/2/3/4 steps the clock gauge draws, so the ring a
 * patient sees and the word beside it cannot disagree.
 */
export function severityForZ(absZ: number): Severity {
  if (absZ < 1) return "normal";
  if (absZ < 2) return "mild";
  if (absZ < 3) return "moderate";
  if (absZ < 4) return "severe";
  return "extreme";
}

function zScore(value: number, min: number | null, max: number | null): number | null {
  if (min == null || max == null || max <= min) return null;
  const mean = (min + max) / 2;
  const sd = (max - min) / 4;
  return (value - mean) / sd;
}

function statusFor(value: number, min: number | null, max: number | null): BiomarkerStatus {
  if (min == null || max == null) return "Unknown";
  if (value < min) return "Low";
  if (value > max) return "High";
  return "Normal";
}

interface ReadingRow {
  id: string;
  shortCode: string;
  name: string;
  unit: string | null;
  rangeMin: number | null;
  rangeMax: number | null;
  direction: boolean;
  value: number;
  collectedOn: string | null;
  recordedAt: Date;
}

function toDashboardBiomarker(row: ReadingRow): DashboardBiomarker {
  const z = zScore(row.value, row.rangeMin, row.rangeMax);
  return {
    id: row.id,
    shortCode: row.shortCode,
    name: row.name,
    unit: row.unit,
    value: row.value,
    rangeMin: row.rangeMin,
    rangeMax: row.rangeMax,
    direction: row.direction,
    z,
    status: statusFor(row.value, row.rangeMin, row.rangeMax),
    severity: z == null ? null : severityForZ(Math.abs(z)),
    collectedOn: row.collectedOn,
    recordedAt: row.recordedAt.toISOString(),
  };
}

const byDeviation = (a: DashboardBiomarker, b: DashboardBiomarker) =>
  Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0);

/**
 * The dashboard for one patient.
 *
 * Accepts either identifier because the same person has two: a chart, which
 * the clinic types readings against, and a login, which may not exist yet.
 * Readings written before the account existed hang off the chart alone, and
 * leaving them out would show a patient a thinner panel than their doctor is
 * looking at.
 */
export interface DashboardOptions {
  /**
   * Override which indexes to show, by short code.
   *
   * Left undefined — the normal case — the patient's own index is used: the
   * one the clinic chose on their record, or CBLAI until somebody does (see
   * patient-index.ts). That is a clinical decision, so it is made in the
   * clinic panel and never offered as a switch on the patient's own screen;
   * a patient shown two biological ages has no basis for picking one.
   */
  indexShortCodes?: string[];
}

export async function patientDashboard(
  db: Db,
  who: { userId?: string | null; patientId?: string | null },
  options: DashboardOptions = {},
): Promise<PatientDashboard> {
  const blank: PatientDashboard = {
    patient: { userId: who.userId ?? null, patientId: who.patientId ?? null, name: null },
    indexes: [],
    biomarkers: [],
    inRange: 0,
    measured: 0,
    lastPanelOn: null,
  };

  if (!who.userId && !who.patientId) return blank;

  // One person, two ids: resolve whichever we were not given, so a reading
  // filed against only one of them is still found.
  const chart = who.patientId
    ? await db.query.patientRecord.findFirst({ where: eq(patientRecord.id, who.patientId) })
    : await db.query.patientRecord.findFirst({ where: eq(patientRecord.userId, who.userId!) });

  const patientId = chart?.id ?? who.patientId ?? null;
  const userId = chart?.userId ?? who.userId ?? null;
  const name = chart ? [chart.firstName, chart.lastName].filter(Boolean).join(" ") : null;
  const patient = { userId, patientId, name };

  // ---- readings: append-only, so "current" is the newest row per marker ----
  const readingRows = await db
    .select({
      id: biomarker.id,
      shortCode: biomarker.shortCode,
      name: biomarker.name,
      unit: biomarker.unit,
      rangeMin: biomarker.rangeMin,
      rangeMax: biomarker.rangeMax,
      direction: biomarker.direction,
      value: biomarkerReading.value,
      collectedOn: biomarkerReading.collectedOn,
      recordedAt: biomarkerReading.recordedAt,
    })
    .from(biomarkerReading)
    .innerJoin(biomarker, eq(biomarker.id, biomarkerReading.biomarkerId))
    .where(
      or(
        userId ? eq(biomarkerReading.userId, userId) : undefined,
        patientId ? eq(biomarkerReading.patientId, patientId) : undefined,
      ),
    )
    .orderBy(sql`${biomarkerReading.collectedOn} desc nulls last`, desc(biomarkerReading.recordedAt));

  const latestByBiomarker = new Map<string, DashboardBiomarker>();
  for (const row of readingRows) {
    // The order above puts the newest first, so the first one wins.
    if (!latestByBiomarker.has(row.id)) latestByBiomarker.set(row.id, toDashboardBiomarker(row));
  }

  const biomarkers = [...latestByBiomarker.values()].sort(byDeviation);
  const scored = biomarkers.filter((b) => b.status !== "Unknown");
  const lastPanelOn = readingRows.map((r) => r.collectedOn).find((d): d is string => !!d) ?? null;

  const totals = {
    biomarkers,
    inRange: scored.filter((b) => b.status === "Normal").length,
    measured: scored.length,
    lastPanelOn,
  };

  // ---- one saved result per index: the latest ----
  const resultRows = await db
    .select({
      id: biologicalAgeResult.id,
      indexId: biomarkerIndex.id,
      shortCode: biomarkerIndex.shortCode,
      indexName: biomarkerIndex.name,
      riskBands: biomarkerIndex.riskBands,
      chronologicalAge: biologicalAgeResult.chronologicalAge,
      biologicalAge: biologicalAgeResult.biologicalAge,
      deltaAge: biologicalAgeResult.deltaAge,
      compositeScore: biologicalAgeResult.compositeScore,
      calculatedAt: biologicalAgeResult.calculatedAt,
    })
    .from(biologicalAgeResult)
    .innerJoin(biomarkerIndex, eq(biomarkerIndex.id, biologicalAgeResult.indexId))
    .where(
      or(
        userId ? eq(biologicalAgeResult.userId, userId) : undefined,
        patientId ? eq(biologicalAgeResult.patientId, patientId) : undefined,
      ),
    )
    .orderBy(desc(biologicalAgeResult.calculatedAt));

  // The index this patient is scored on — chosen for them in the clinic
  // panel, CBLAI until somebody does. An explicit list from the caller still
  // wins, for the clinic's own views. Filtered here rather than in the query
  // so older results for other indexes are simply not shown; no row is
  // touched.
  let wanted = options.indexShortCodes?.map((code) => code.toUpperCase());
  if (!wanted && patientId) {
    const assigned = await resolvePatientIndex(db, patientId);
    if (assigned) wanted = [assigned.index.shortCode.toUpperCase()];
  }
  const eligible = wanted
    ? resultRows.filter((r) => wanted.includes(r.shortCode.toUpperCase()))
    : resultRows;

  const latestPerIndex = new Map<string, (typeof resultRows)[number]>();
  for (const row of eligible) {
    if (!latestPerIndex.has(row.indexId)) latestPerIndex.set(row.indexId, row);
  }
  const latest = [...latestPerIndex.values()];

  // Readings with no saved calculation still belong on the screen — they are
  // what the clinician typed in, and hiding them would look like data loss.
  if (latest.length === 0) return { ...blank, patient, ...totals };

  const resultIds = latest.map((r) => r.id);
  const indexIds = latest.map((r) => r.indexId);

  const domainRows = await db
    .select({
      resultId: domainAgeResult.resultId,
      domainId: biomarkerDomain.id,
      shortCode: biomarkerDomain.shortCode,
      name: biomarkerDomain.name,
      description: biomarkerDomain.description,
      meanAbsZ: domainAgeResult.meanAbsZ,
      biomarkerCount: domainAgeResult.biomarkerCount,
      weightUsed: domainAgeResult.weightUsed,
      alphaUsed: domainAgeResult.alphaUsed,
      contribution: domainAgeResult.contribution,
    })
    .from(domainAgeResult)
    .innerJoin(biomarkerDomain, eq(biomarkerDomain.id, domainAgeResult.domainId))
    .where(inArray(domainAgeResult.resultId, resultIds));

  // Every domain the index *should* cover, so "not measured" can be shown as
  // a gap rather than quietly dropping off the screen.
  const mappedRows = await db
    .select({
      indexId: indexDomainMap.indexId,
      domainId: biomarkerDomain.id,
      shortCode: biomarkerDomain.shortCode,
      name: biomarkerDomain.name,
      description: biomarkerDomain.description,
      riskBands: indexDomainMap.riskBands,
    })
    .from(indexDomainMap)
    .innerJoin(biomarkerDomain, eq(biomarkerDomain.id, indexDomainMap.domainId))
    .where(inArray(indexDomainMap.indexId, indexIds));

  const mapRows = await db
    .select({
      domainId: domainBiomarkerMap.domainId,
      biomarkerId: biomarker.id,
      shortCode: biomarker.shortCode,
    })
    .from(domainBiomarkerMap)
    .innerJoin(biomarker, eq(biomarker.id, domainBiomarkerMap.biomarkerId));

  const markersOfDomain = new Map<string, { id: string; shortCode: string }[]>();
  for (const row of mapRows) {
    const list = markersOfDomain.get(row.domainId) ?? [];
    list.push({ id: row.biomarkerId, shortCode: row.shortCode });
    markersOfDomain.set(row.domainId, list);
  }

  const indexes: DashboardIndex[] = latest.map((result) => {
    const measuredRows = domainRows.filter((d) => d.resultId === result.id);
    const measuredIds = new Set(measuredRows.map((d) => d.domainId));
    const mapped = mappedRows.filter((m) => m.indexId === result.indexId);
    const bandsByDomain = new Map(mapped.map((m) => [m.domainId, parseRiskBands(m.riskBands)]));
    const totalDelta = measuredRows.reduce((sum, d) => sum + d.contribution, 0);

    const build = (
      domainId: string,
      shortCode: string,
      domainName: string,
      description: string | null,
    ): DashboardDomain => {
      const saved = measuredRows.find((d) => d.domainId === domainId);
      const all = markersOfDomain.get(domainId) ?? [];
      const present = all
        .map((m) => latestByBiomarker.get(m.id))
        .filter((b): b is DashboardBiomarker => !!b)
        .sort(byDeviation);
      const presentIds = new Set(present.map((b) => b.id));

      if (!saved) {
        return {
          id: domainId,
          shortCode,
          name: domainName,
          description,
          meanAbsZ: null,
          biomarkerCount: 0,
          weightUsed: null,
          alphaUsed: null,
          contribution: null,
          shareOfDelta: null,
          severity: null,
          band: null,
          measured: false,
          biomarkers: [],
          missing: all.map((m) => m.shortCode),
        };
      }

      // The band is set against the domain's observed score within this
      // index — Mean|Z| × W — not against Mean|Z| alone.
      const observed = saved.meanAbsZ * saved.weightUsed;

      return {
        id: domainId,
        shortCode,
        name: domainName,
        description,
        meanAbsZ: saved.meanAbsZ,
        biomarkerCount: saved.biomarkerCount,
        weightUsed: saved.weightUsed,
        alphaUsed: saved.alphaUsed,
        contribution: saved.contribution,
        shareOfDelta: totalDelta > 0 ? saved.contribution / totalDelta : null,
        severity: severityForZ(saved.meanAbsZ),
        band: bandForScore(bandsByDomain.get(domainId) ?? [], observed),
        measured: true,
        biomarkers: present,
        missing: all.filter((m) => !presentIds.has(m.id)).map((m) => m.shortCode),
      };
    };

    const fromMapped = mapped.map((m) => build(m.domainId, m.shortCode, m.name, m.description));
    // A domain can have a saved result without still being mapped — the
    // mapping was edited after the run. The saved row is what the number was
    // actually built from, so it stays.
    const orphans = measuredRows
      .filter((d) => !mapped.some((m) => m.domainId === d.domainId))
      .map((d) => build(d.domainId, d.shortCode, d.name, d.description));

    const domains = [...fromMapped, ...orphans].sort((a, b) => {
      if (a.measured !== b.measured) return a.measured ? -1 : 1;
      return (b.contribution ?? 0) - (a.contribution ?? 0);
    });

    return {
      id: result.indexId,
      shortCode: result.shortCode,
      name: result.indexName,
      resultId: result.id,
      chronologicalAge: result.chronologicalAge,
      biologicalAge: result.biologicalAge,
      deltaAge: result.deltaAge,
      compositeScore: result.compositeScore,
      band: bandForScore(parseRiskBands(result.riskBands), result.compositeScore),
      calculatedAt: result.calculatedAt.toISOString(),
      domains,
      measuredDomains: measuredIds.size,
      mappedDomains: new Set([...mapped.map((m) => m.domainId), ...measuredIds]).size,
    };
  });

  // Worst first: the index worth opening is the one furthest from the
  // patient's real age, not whichever happened to be saved last.
  indexes.sort((a, b) => b.deltaAge - a.deltaAge);

  return { patient, indexes, ...totals };
}
