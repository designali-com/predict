import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq } from "drizzle-orm";
import { dietProtocolTemplate } from "./schema";
import type * as schema from "./schema";
import { normalizeProtocol, type DietProtocol } from "./diet-protocol";

type Db = NodePgDatabase<typeof schema>;

/**
 * The clinic's library of dietary protocols (Care Plan Library → Diet
 * protocols). Written once, kept in veg / egg / non-veg variants, duplicated to
 * start a new one, and copied onto a patient from their Nutrition tab.
 *
 * Copied, not linked: a patient's protocol is theirs to adjust, and correcting
 * the library later must not silently change a plan somebody is following.
 * Removing one only hides it — patients it was copied to keep their copy.
 */

export interface LibraryProtocol {
  id: string;
  name: string;
  diet: string | null;
  protocol: DietProtocol;
  updatedAt: string;
}

const shape = (row: typeof dietProtocolTemplate.$inferSelect): LibraryProtocol => ({
  id: row.id,
  name: row.name,
  diet: row.diet,
  protocol: row.protocol as DietProtocol,
  updatedAt: row.updatedAt.toISOString(),
});

export async function listLibraryProtocols(db: Db): Promise<LibraryProtocol[]> {
  const rows = await db
    .select()
    .from(dietProtocolTemplate)
    .where(eq(dietProtocolTemplate.isActive, true))
    .orderBy(asc(dietProtocolTemplate.name));
  return rows.map(shape);
}

export async function getLibraryProtocol(db: Db, id: string): Promise<LibraryProtocol | null> {
  const [row] = await db
    .select()
    .from(dietProtocolTemplate)
    .where(and(eq(dietProtocolTemplate.id, id), eq(dietProtocolTemplate.isActive, true)))
    .limit(1);
  return row ? shape(row) : null;
}

/** The library name is the protocol's title, so the two never disagree. */
function prepare(input: unknown) {
  const protocol = normalizeProtocol(input);
  // A library protocol is not "copied from" anything once saved.
  delete protocol.source;
  delete protocol.updated;
  return protocol;
}

export async function createLibraryProtocol(db: Db, input: unknown, byUserId: string): Promise<LibraryProtocol> {
  const protocol = prepare(input);
  const [row] = await db
    .insert(dietProtocolTemplate)
    .values({
      name: protocol.title,
      diet: protocol.diet,
      protocol,
      createdByUserId: byUserId,
      updatedByUserId: byUserId,
    })
    .returning();
  return shape(row!);
}

export async function updateLibraryProtocol(db: Db, id: string, input: unknown, byUserId: string): Promise<LibraryProtocol | null> {
  const protocol = prepare(input);
  const [row] = await db
    .update(dietProtocolTemplate)
    .set({ name: protocol.title, diet: protocol.diet, protocol, updatedByUserId: byUserId, updatedAt: new Date() })
    .where(and(eq(dietProtocolTemplate.id, id), eq(dietProtocolTemplate.isActive, true)))
    .returning();
  return row ? shape(row) : null;
}

export async function removeLibraryProtocol(db: Db, id: string, byUserId: string): Promise<boolean> {
  const [row] = await db
    .update(dietProtocolTemplate)
    .set({ isActive: false, updatedByUserId: byUserId, updatedAt: new Date() })
    .where(eq(dietProtocolTemplate.id, id))
    .returning({ id: dietProtocolTemplate.id });
  return !!row;
}
