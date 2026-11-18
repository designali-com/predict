import "dotenv/config";
import { db } from "@workspace/db/client";
import { clinicChannel } from "@workspace/db/schema";
import { listClinics } from "@workspace/db/clinic-service";

/**
 * Registers the number already configured in the environment as the first
 * clinic's WhatsApp channel, marked as the group default.
 *
 *   pnpm seed:clinic-channel
 *
 * Until a row exists, sending falls back to the env vars — so this changes
 * nothing about today's behaviour. What it gives you is the row a second
 * number is added *next to*, and the mapping that lets an inbound message
 * say which clinic it belongs to.
 */
async function main() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");

  const [first] = await listClinics(db);
  if (!first) throw new Error("No clinic exists yet — open one first");

  const existing = await db.select().from(clinicChannel);
  if (existing.some((c) => c.phoneNumberId === phoneNumberId)) {
    console.log(`already registered: ${phoneNumberId}`);
    process.exit(0);
  }

  const [row] = await db
    .insert(clinicChannel)
    .values({
      clinicId: first.id,
      phoneNumberId,
      wabaId: process.env.WHATSAPP_WABA_ID ?? null,
      displayNumber: process.env.WHATSAPP_DISPLAY_NUMBER ?? null,
      // No tokenEnvVar: this one uses the default WHATSAPP_ACCESS_TOKEN.
      isDefault: true,
    })
    .returning();

  console.log(`registered ${phoneNumberId} to ${first.name} (default for the group)`);
  console.log(`channel id: ${row!.id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
