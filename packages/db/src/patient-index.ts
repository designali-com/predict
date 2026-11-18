import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { asc, eq, sql } from "drizzle-orm";
import { biomarkerIndex, indexDomainMap, patientRecord } from "./schema";
import type * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

/**
 * Which composite index a patient is scored on.
 *
 * One per patient. The clinic picks it on the patient's record; until
 * somebody does, it is the default. The clock the patient sees, the domains
 * on it and the biological age in the middle are all built from this one
 * index — there is never a second biological age on a patient's screen for
 * them to choose between.
 */

/** The index every patient starts on. */
export const DEFAULT_INDEX_SHORT_CODE = "CBLAI";

export interface IndexSummary {
  id: string;
  shortCode: string;
  name: string;
  /** How many domains the index is built from. */
  domainCount: number;
}

export interface PatientIndex {
  index: IndexSummary;
  /** True when nobody has chosen, and this is the default. */
  isDefault: boolean;
}

/** Every index, with its domain count, default first. */
export async function listIndexes(db: Db): Promise<IndexSummary[]> {
  const rows = await db
    .select({
      id: biomarkerIndex.id,
      shortCode: biomarkerIndex.shortCode,
      name: biomarkerIndex.name,
      domainCount: sql<number>`(select count(*)::int from ${indexDomainMap} where ${indexDomainMap.indexId} = ${biomarkerIndex.id})`,
    })
    .from(biomarkerIndex)
    .orderBy(asc(biomarkerIndex.shortCode));

  return rows.sort((a, b) =>
    a.shortCode === DEFAULT_INDEX_SHORT_CODE ? -1 : b.shortCode === DEFAULT_INDEX_SHORT_CODE ? 1 : 0,
  );
}

export async function defaultIndex(db: Db): Promise<IndexSummary | null> {
  const all = await listIndexes(db);
  return all.find((i) => i.shortCode === DEFAULT_INDEX_SHORT_CODE) ?? all[0] ?? null;
}

/**
 * The index this chart is scored on: the one chosen for it, or the default.
 *
 * Null only when the catalogue has no indexes at all — there is then nothing
 * to score against, and the caller says so rather than guessing.
 */
export async function resolvePatientIndex(db: Db, patientId: string): Promise<PatientIndex | null> {
  const [chart] = await db
    .select({ indexId: patientRecord.biomarkerIndexId })
    .from(patientRecord)
    .where(eq(patientRecord.id, patientId))
    .limit(1);

  const all = await listIndexes(db);
  const chosen = chart?.indexId ? all.find((i) => i.id === chart.indexId) : undefined;
  if (chosen) return { index: chosen, isDefault: false };

  const fallback = all.find((i) => i.shortCode === DEFAULT_INDEX_SHORT_CODE) ?? all[0];
  return fallback ? { index: fallback, isDefault: true } : null;
}

/**
 * Put a patient on an index, or back on the default with null.
 *
 * Picking the default index is stored as null too. The picker lists one
 * CBLAI, not a "Default" entry and a "CBLAI" entry that mean the same today
 * and could be told apart only by a column nobody can see.
 */
export async function setPatientIndex(db: Db, patientId: string, indexId: string | null): Promise<void> {
  let value = indexId;
  if (indexId) {
    const fallback = await defaultIndex(db);
    if (fallback?.id === indexId) value = null;
  }

  await db
    .update(patientRecord)
    .set({ biomarkerIndexId: value, updatedAt: new Date() })
    .where(eq(patientRecord.id, patientId));
}
