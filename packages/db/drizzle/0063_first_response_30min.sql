-- The first-response window goes from 15 to 30 minutes.
--
-- Only rows still on the old default move. A clinic that set its own number
-- chose it; raising that behind their back would be overriding a decision,
-- not correcting a default.

ALTER TABLE "automation_settings" ALTER COLUMN "first_response_minutes" SET DEFAULT 30;
--> statement-breakpoint
UPDATE "automation_settings" SET "first_response_minutes" = 30, "updated_at" = now()
WHERE "first_response_minutes" = 15;
