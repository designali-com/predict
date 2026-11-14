import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, isNull, sql } from "drizzle-orm";
import { automationSettings, systemHeartbeat } from "./schema";
import type * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export type AutomationSettings = typeof automationSettings.$inferSelect;

/**
 * This clinic's house rules, created on first read.
 *
 * Called without a clinic (a script, a path that has not been given one yet)
 * it returns the first row, so nothing breaks while callers are updated.
 */
export async function getAutomationSettings(db: Db, clinicId?: string | null): Promise<AutomationSettings> {
  if (clinicId) {
    const [row] = await db
      .select()
      .from(automationSettings)
      .where(eq(automationSettings.clinicId, clinicId))
      .limit(1);
    if (row) return row;

    // A new clinic starts with the same defaults as the first one, not with
    // nothing: quiet hours off by accident is how 2am messages happen.
    const [created] = await db.insert(automationSettings).values({ clinicId }).returning();
    return created!;
  }

  const [row] = await db
    .select()
    .from(automationSettings)
    .where(isNull(automationSettings.clinicId))
    .limit(1);
  if (row) return row;
  const [any] = await db.select().from(automationSettings).limit(1);
  if (any) return any;
  const [created] = await db.insert(automationSettings).values({}).returning();
  return created!;
}

export async function updateAutomationSettings(
  db: Db,
  id: string,
  values: Partial<typeof automationSettings.$inferInsert>,
): Promise<AutomationSettings> {
  const [row] = await db
    .update(automationSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(automationSettings.id, id))
    .returning();
  return row!;
}

/**
 * The hour on the clinic's own clock, not the server's. An EC2 box in
 * Mumbai, Frankfurt or on a developer's laptop must all agree on whether it
 * is currently 2am in Delhi.
 */
export function localHour(at: Date, timezone: string): number {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(at);
    return Number(hour);
  } catch {
    // An unknown timezone must not stop a send; treat it as always daytime.
    return 12;
  }
}

/**
 * Is it too late (or too early) to message somebody?
 *
 * Handles the ordinary overnight window (21:00 -> 09:00) and the odd
 * same-day one (13:00 -> 15:00) alike.
 */
export function isQuietHour(settings: AutomationSettings, at: Date = new Date()): boolean {
  if (!settings.quietHoursEnabled) return false;
  const start = settings.quietStartHour;
  const end = settings.quietEndHour;
  if (start === end) return false;
  const hour = localHour(at, settings.timezone);
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/**
 * The next moment it is polite to send. Returns null when it already is.
 *
 * Deliberately the start of the open window and not a minute later: a lead
 * who enquired at midnight should hear from us first thing, not at noon.
 */
export function nextOpenTime(settings: AutomationSettings, at: Date = new Date()): Date | null {
  if (!isQuietHour(settings, at)) return null;

  // Walk forward hour by hour rather than doing timezone arithmetic by hand
  // — DST and half-hour offsets (IST is +5:30) make the direct calculation
  // a reliable source of off-by-one-hour bugs.
  const candidate = new Date(at.getTime());
  candidate.setMinutes(0, 0, 0);
  for (let i = 0; i < 48; i++) {
    candidate.setTime(candidate.getTime() + 60 * 60 * 1000);
    if (!isQuietHour(settings, candidate)) return candidate;
  }
  return null;
}

/** "I am alive" — called by the worker and the webhook server each tick. */
export async function recordHeartbeat(db: Db, name: string, detail?: string): Promise<void> {
  await db
    .insert(systemHeartbeat)
    .values({ name, lastSeenAt: new Date(), detail: detail ?? null })
    .onConflictDoUpdate({
      target: systemHeartbeat.name,
      set: { lastSeenAt: new Date(), detail: detail ?? null },
    });
}

export interface HeartbeatStatus {
  name: string;
  lastSeenAt: Date;
  secondsAgo: number;
  healthy: boolean;
  detail: string | null;
}

/** What the console shows: who last checked in, and whether that was recently. */
export async function heartbeats(db: Db, staleAfterSeconds = 120): Promise<HeartbeatStatus[]> {
  const rows = await db
    .select({
      name: systemHeartbeat.name,
      lastSeenAt: systemHeartbeat.lastSeenAt,
      detail: systemHeartbeat.detail,
      secondsAgo: sql<number>`extract(epoch from (now() - ${systemHeartbeat.lastSeenAt}))::int`,
    })
    .from(systemHeartbeat);

  return rows.map((r) => ({
    name: r.name,
    lastSeenAt: r.lastSeenAt,
    detail: r.detail,
    secondsAgo: r.secondsAgo,
    healthy: r.secondsAgo <= staleAfterSeconds,
  }));
}
