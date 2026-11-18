-- When a flow started listening.
--
-- The worker rescans the 200 most recent lifecycle events every tick and
-- relies on (event, flow) uniqueness to skip ones it has already claimed. A
-- flow activated today has claimed none of them — so switching on a "new lead"
-- flow would immediately start runs for every recent event in history, i.e.
-- WhatsApp hundreds of old leads and patients at once. Verified: a test flow
-- raised its task against a months-old contact.
--
-- A flow now only reacts to events that happened after it was switched on.
ALTER TABLE "automation_flow" ADD COLUMN IF NOT EXISTS "activated_at" timestamp;
--> statement-breakpoint
UPDATE "automation_flow" SET "activated_at" = now() WHERE "status" = 'active' AND "activated_at" IS NULL;
