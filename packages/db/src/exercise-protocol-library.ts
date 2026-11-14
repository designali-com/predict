import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq } from "drizzle-orm";
import { exerciseProtocolTemplate } from "./schema";
import type * as schema from "./schema";
import { normalizeExerciseProtocol, type ExerciseProtocol } from "./exercise-protocol";

type Db = NodePgDatabase<typeof schema>;

/**
 * The clinic's library of exercise prescriptions (Care Plan Library →
 * Exercise). Copied onto a patient, never linked — the same rules as the diet
 * library (./diet-protocol-library.ts): a patient's copy is theirs to adjust,
 * and removing one from the library only hides it.
 */

export interface LibraryExerciseProtocol {
  id: string;
  name: string;
  protocol: ExerciseProtocol;
  updatedAt: string;
}

const shape = (row: typeof exerciseProtocolTemplate.$inferSelect): LibraryExerciseProtocol => ({
  id: row.id,
  name: row.name,
  protocol: row.protocol as ExerciseProtocol,
  updatedAt: row.updatedAt.toISOString(),
});

export async function listLibraryExerciseProtocols(db: Db): Promise<LibraryExerciseProtocol[]> {
  const rows = await db
    .select()
    .from(exerciseProtocolTemplate)
    .where(eq(exerciseProtocolTemplate.isActive, true))
    .orderBy(asc(exerciseProtocolTemplate.name));
  return rows.map(shape);
}

function prepare(input: unknown) {
  const protocol = normalizeExerciseProtocol(input);
  delete protocol.source;
  delete protocol.updated;
  return protocol;
}

export async function createLibraryExerciseProtocol(db: Db, input: unknown, byUserId: string): Promise<LibraryExerciseProtocol> {
  const protocol = prepare(input);
  const [row] = await db
    .insert(exerciseProtocolTemplate)
    .values({ name: protocol.title, protocol, createdByUserId: byUserId, updatedByUserId: byUserId })
    .returning();
  return shape(row!);
}

export async function updateLibraryExerciseProtocol(
  db: Db,
  id: string,
  input: unknown,
  byUserId: string,
): Promise<LibraryExerciseProtocol | null> {
  const protocol = prepare(input);
  const [row] = await db
    .update(exerciseProtocolTemplate)
    .set({ name: protocol.title, protocol, updatedByUserId: byUserId, updatedAt: new Date() })
    .where(and(eq(exerciseProtocolTemplate.id, id), eq(exerciseProtocolTemplate.isActive, true)))
    .returning();
  return row ? shape(row) : null;
}

export async function removeLibraryExerciseProtocol(db: Db, id: string, byUserId: string): Promise<boolean> {
  const [row] = await db
    .update(exerciseProtocolTemplate)
    .set({ isActive: false, updatedByUserId: byUserId, updatedAt: new Date() })
    .where(eq(exerciseProtocolTemplate.id, id))
    .returning({ id: exerciseProtocolTemplate.id });
  return !!row;
}
