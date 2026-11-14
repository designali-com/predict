import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { checkinLog } from "./schema";
import type * as schema from "./schema";
import { istDate, type CheckinEntry, type CheckinKind } from "./checkin";

type Db = NodePgDatabase<typeof schema>;

/**
 * Where the daily check-in answers live (see ./checkin.ts). One row per
 * patient per kind per day: a late tap, a second tap or a correction by staff
 * changes that day rather than adding another.
 */

export async function recordCheckin(
  db: Db,
  params: {
    contactId: string;
    kind: CheckinKind;
    forDate: string;
    response: string;
    source?: string;
    messageId?: string | null;
  },
): Promise<void> {
  const source = params.source ?? "whatsapp";
  await db
    .insert(checkinLog)
    .values({
      contactId: params.contactId,
      kind: params.kind,
      forDate: params.forDate,
      response: params.response,
      source,
      messageId: params.messageId ?? null,
    })
    .onConflictDoUpdate({
      target: [checkinLog.contactId, checkinLog.kind, checkinLog.forDate],
      set: { response: params.response, source, messageId: params.messageId ?? null, updatedAt: new Date() },
    });
}

/** The last `days` days of answers, every kind, newest first. */
export async function recentCheckins(db: Db, contactId: string, days = 60): Promise<CheckinEntry[]> {
  const rows = await db
    .select({ kind: checkinLog.kind, forDate: checkinLog.forDate, response: checkinLog.response, source: checkinLog.source })
    .from(checkinLog)
    .where(and(eq(checkinLog.contactId, contactId), gte(checkinLog.forDate, istDate(new Date(), -days))))
    .orderBy(desc(checkinLog.forDate));
  return rows.map((r) => ({ ...r, kind: r.kind as CheckinKind }));
}

/** Every answer between two days (inclusive, YYYY-MM-DD), every kind — for a month view. */
export async function checkinsBetween(db: Db, contactId: string, from: string, to: string): Promise<CheckinEntry[]> {
  const rows = await db
    .select({ kind: checkinLog.kind, forDate: checkinLog.forDate, response: checkinLog.response, source: checkinLog.source })
    .from(checkinLog)
    .where(and(eq(checkinLog.contactId, contactId), gte(checkinLog.forDate, from), lte(checkinLog.forDate, to)))
    .orderBy(desc(checkinLog.forDate));
  return rows.map((r) => ({ ...r, kind: r.kind as CheckinKind }));
}
