import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { asc, eq } from "drizzle-orm";
import { valdTestType } from "./schema";
import type * as schema from "./schema";
import { VALD_TESTS, type ValdTestDef } from "./vald-catalog";

type Db = NodePgDatabase<typeof schema>;
type Row = typeof valdTestType.$inferSelect;

/**
 * The clinic's DynaMo test catalogue, from vald_test_type.
 *
 * Seeded with every test the DynaMo offers (drizzle/0086), with VALD's steps
 * and video; the clinic switches tests off, edits them and adds its own. A
 * result is still filed in vald_test under VALD's region / movement / position
 * names, so a test run here and one synced from VALD land on the same trend.
 */

export function rowToDef(r: Row): ValdTestDef {
  return {
    key: r.key,
    label: r.label,
    region: r.region,
    category: r.category === "RangeofMotion" ? "RangeofMotion" : "Strength",
    movement: r.movement,
    position: r.position,
    positionLabel: r.positionLabel,
    kind: r.kind === "rom" ? "rom" : "force",
    romOffsetDegrees: r.romOffsetDegrees,
    gripDeviceOk: r.gripDeviceOk,
    setup: r.setup ?? "",
    laterality: r.laterality === "None" ? "None" : "Bilateral",
    videoUrl: r.videoUrl,
    videoSource: r.videoSource,
    sourceUrl: r.sourceUrl,
    featured: r.featured,
    active: r.active,
    origin: r.origin,
  };
}

/** Every test, or only the ones offered (active). Featured first, then by region. */
export async function listValdTestTypes(db: Db, opts: { includeInactive?: boolean } = {}): Promise<ValdTestDef[]> {
  const rows = await db
    .select()
    .from(valdTestType)
    .where(opts.includeInactive ? undefined : eq(valdTestType.active, true))
    .orderBy(asc(valdTestType.region), asc(valdTestType.label), asc(valdTestType.positionLabel));
  if (!rows.length) return VALD_TESTS;
  return rows.map(rowToDef).sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
}

/**
 * One test by key — switched-off ones included, since a prescription written
 * before a test was switched off still names it. Falls back to the original
 * short list for a database the catalogue has not been seeded into.
 */
export async function getValdTestType(db: Db, key: string): Promise<ValdTestDef | undefined> {
  const [row] = await db.select().from(valdTestType).where(eq(valdTestType.key, key)).limit(1);
  return row ? rowToDef(row) : VALD_TESTS.find((t) => t.key === key);
}

export interface ValdTestTypeInput {
  label?: string;
  region?: string;
  category?: "Strength" | "RangeofMotion";
  movement?: string;
  position?: string;
  positionLabel?: string;
  laterality?: "Bilateral" | "None";
  setup?: string | null;
  videoUrl?: string | null;
  featured?: boolean;
  active?: boolean;
  romOffsetDegrees?: number;
}

const text = (v: unknown, max = 200): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

/** A video link must be https; anything else is dropped rather than embedded. */
export function cleanVideoUrl(v: unknown): string | null | undefined {
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Only the fields a person may change, cleaned. */
export function parseValdTestTypeInput(body: Record<string, unknown>): ValdTestTypeInput {
  const out: ValdTestTypeInput = {};
  const label = text(body.label);
  if (label) out.label = label;
  const region = text(body.region, 40);
  if (region) out.region = region;
  if (body.category === "Strength" || body.category === "RangeofMotion") out.category = body.category;
  const movement = text(body.movement, 60);
  if (movement) out.movement = movement;
  const position = text(body.position, 80);
  if (position) out.position = position;
  const positionLabel = text(body.positionLabel, 80);
  if (positionLabel) out.positionLabel = positionLabel;
  if (body.laterality === "Bilateral" || body.laterality === "None") out.laterality = body.laterality;
  if (body.setup === null || typeof body.setup === "string") out.setup = body.setup ? String(body.setup).slice(0, 4000) : null;
  const video = cleanVideoUrl(body.videoUrl);
  if (video !== undefined) out.videoUrl = video;
  if (typeof body.featured === "boolean") out.featured = body.featured;
  if (typeof body.active === "boolean") out.active = body.active;
  if (typeof body.romOffsetDegrees === "number" && Number.isFinite(body.romOffsetDegrees)) out.romOffsetDegrees = body.romOffsetDegrees;
  return out;
}

export async function updateValdTestType(db: Db, key: string, input: ValdTestTypeInput, previousVideo?: string | null): Promise<ValdTestDef | null> {
  const [row] = await db
    .update(valdTestType)
    .set({
      ...input,
      ...(input.videoUrl !== undefined
        ? { videoSource: input.videoUrl ? (input.videoUrl === previousVideo ? undefined : "clinic") : null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(valdTestType.key, key))
    .returning();
  return row ? rowToDef(row) : null;
}

const slug = (s: string) =>
  s.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A test the clinic adds itself. VALD's names are used when the operator gives them. */
export async function createValdTestType(db: Db, input: ValdTestTypeInput): Promise<ValdTestDef> {
  if (!input.label || !input.region || !input.category || !input.movement) {
    throw new Error("A test needs a name, a body region, strength or ROM, and a movement.");
  }
  const rom = input.category === "RangeofMotion";
  const position = input.position ?? input.positionLabel?.replace(/[^A-Za-z0-9]/g, "") ?? "Standard";
  let key = slug(`clinic ${input.region} ${input.movement} ${position}${rom ? " rom" : ""}`);
  for (let i = 2; await getValdTestType(db, key); i++) key = `${key.replace(/-\d+$/, "")}-${i}`;
  const [row] = await db
    .insert(valdTestType)
    .values({
      key,
      label: input.label,
      region: input.region,
      category: input.category,
      movement: input.movement,
      position,
      positionLabel: input.positionLabel ?? position,
      laterality: input.laterality ?? "Bilateral",
      kind: rom ? "rom" : "force",
      romOffsetDegrees: input.romOffsetDegrees ?? 0,
      gripDeviceOk: false,
      setup: input.setup ?? null,
      videoUrl: input.videoUrl ?? null,
      videoSource: input.videoUrl ? "clinic" : null,
      featured: input.featured ?? true,
      active: input.active ?? true,
      origin: "clinic",
    })
    .returning();
  return rowToDef(row!);
}
