import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { checkinSetting } from "./schema";
import type * as schema from "./schema";
import { CHECKIN_KINDS, type CheckinKind } from "./checkin";

type Db = NodePgDatabase<typeof schema>;

/** Each daily check-in's switch and send time (IST). A kind with no row is on, at 9:00. */
export interface CheckinSettingValue {
  kind: CheckinKind;
  enabled: boolean;
  hour: number;
  minute: number;
}

export const DEFAULT_CHECKIN_HOUR = 9;

export async function getCheckinSettings(db: Db): Promise<Record<CheckinKind, CheckinSettingValue>> {
  const rows = await db.select().from(checkinSetting);
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return Object.fromEntries(
    CHECKIN_KINDS.map((kind) => {
      const r = byKind.get(kind);
      return [kind, { kind, enabled: r?.enabled ?? true, hour: r?.sendHour ?? DEFAULT_CHECKIN_HOUR, minute: r?.sendMinute ?? 0 }];
    }),
  ) as Record<CheckinKind, CheckinSettingValue>;
}

export async function saveCheckinSetting(
  db: Db,
  input: { kind: CheckinKind; enabled: boolean; hour: number; minute: number },
  byUserId: string | null,
): Promise<void> {
  const hour = Math.min(23, Math.max(0, Math.floor(input.hour)));
  const minute = Math.min(59, Math.max(0, Math.floor(input.minute)));
  await db
    .insert(checkinSetting)
    .values({ kind: input.kind, enabled: input.enabled, sendHour: hour, sendMinute: minute, updatedByUserId: byUserId })
    .onConflictDoUpdate({
      target: checkinSetting.kind,
      set: { enabled: input.enabled, sendHour: hour, sendMinute: minute, updatedByUserId: byUserId, updatedAt: new Date() },
    });
}
