-- Automation belongs to a clinic, like everything else.
--
-- Without this, activating a nurture flow in Delhi would run it for Kolkata's
-- leads too, and one set of quiet hours would govern both cities. Each clinic
-- gets its own flows, its own AI settings and its own house rules.
ALTER TABLE "automation_flow" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_reply_config" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- What exists today belongs to the first clinic.
UPDATE "automation_flow" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "ai_reply_config" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "automation_settings" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint

-- One settings row per clinic, enforced rather than assumed: two rows for the
-- same clinic would mean whichever one loaded first decided the rules.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_reply_config_clinic_unique" ON "ai_reply_config" ("clinic_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "automation_settings_clinic_unique" ON "automation_settings" ("clinic_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "automation_flow_clinic_idx" ON "automation_flow" ("clinic_id", "status", "trigger_event_type");
