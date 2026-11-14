import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq } from "drizzle-orm";
import { clinic, clinicChannel } from "./schema";
import type * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export type ClinicChannel = typeof clinicChannel.$inferSelect;

/**
 * Which WhatsApp number a clinic sends from, and which clinic a number
 * belongs to.
 *
 * Two clinics share one number today. The day Kolkata gets its own, an
 * inbound message has to find the right clinic and a reply has to leave from
 * the right number — both of which are lookups here, not code changes.
 *
 * Tokens are never stored: the row names the environment variable that holds
 * one. A database dump of this table is not a set of live credentials.
 */

export interface ResolvedChannel {
  channel: ClinicChannel;
  phoneNumberId: string;
  accessToken: string | null;
  /** True when the token this row points at is missing from the environment. */
  missingToken: boolean;
}

function withToken(channel: ClinicChannel): ResolvedChannel {
  const name = channel.tokenEnvVar?.trim();
  const accessToken = (name ? process.env[name] : process.env.WHATSAPP_ACCESS_TOKEN) ?? null;
  return {
    channel,
    phoneNumberId: channel.phoneNumberId,
    accessToken,
    missingToken: !accessToken,
  };
}

export async function listChannels(db: Db, clinicId?: string): Promise<ClinicChannel[]> {
  const rows = await db
    .select()
    .from(clinicChannel)
    .where(clinicId ? eq(clinicChannel.clinicId, clinicId) : undefined)
    .orderBy(asc(clinicChannel.createdAt));
  return rows;
}

/** The number this clinic sends from, or null when it has none of its own. */
export async function channelForClinic(
  db: Db,
  clinicId: string | null | undefined,
  channel = "whatsapp",
): Promise<ResolvedChannel | null> {
  if (clinicId) {
    const rows = await db
      .select()
      .from(clinicChannel)
      .where(
        and(
          eq(clinicChannel.clinicId, clinicId),
          eq(clinicChannel.channel, channel),
          eq(clinicChannel.isActive, true),
        ),
      )
      .orderBy(asc(clinicChannel.createdAt));
    const own = rows.find((r) => r.isDefault) ?? rows[0];
    if (own) return withToken(own);
  }

  // No number of its own: fall back to the one marked default for the group,
  // which is how two clinics share a single number today.
  const [shared] = await db
    .select()
    .from(clinicChannel)
    .where(and(eq(clinicChannel.channel, channel), eq(clinicChannel.isDefault, true), eq(clinicChannel.isActive, true)))
    .limit(1);
  return shared ? withToken(shared) : null;
}

/** Which clinic a message that arrived on this number belongs to. */
export async function channelByPhoneNumberId(db: Db, phoneNumberId: string): Promise<ResolvedChannel | null> {
  const [row] = await db
    .select()
    .from(clinicChannel)
    .where(eq(clinicChannel.phoneNumberId, phoneNumberId))
    .limit(1);
  return row ? withToken(row) : null;
}

export interface ChannelInput {
  clinicId: string;
  phoneNumberId: string;
  wabaId?: string | null;
  displayNumber?: string | null;
  tokenEnvVar?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  channel?: string;
}

export async function saveChannel(db: Db, input: ChannelInput, id?: string): Promise<ClinicChannel> {
  // Exactly one default per channel type: two would make "which number do we
  // send from" depend on row order.
  if (input.isDefault) {
    await db
      .update(clinicChannel)
      .set({ isDefault: false })
      .where(eq(clinicChannel.channel, input.channel ?? "whatsapp"));
  }

  if (id) {
    const [row] = await db
      .update(clinicChannel)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(clinicChannel.id, id))
      .returning();
    return row!;
  }
  const [row] = await db.insert(clinicChannel).values(input).returning();
  return row!;
}

export async function deleteChannel(db: Db, id: string): Promise<void> {
  await db.delete(clinicChannel).where(eq(clinicChannel.id, id));
}

/** Channels with the clinic they belong to — for the settings screen. */
export async function channelsWithClinic(db: Db) {
  return db
    .select({ channel: clinicChannel, clinicName: clinic.name })
    .from(clinicChannel)
    .innerJoin(clinic, eq(clinic.id, clinicChannel.clinicId))
    .orderBy(asc(clinicChannel.createdAt));
}
