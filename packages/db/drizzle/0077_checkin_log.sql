-- One log for every daily check-in — medicine, exercise and diet — instead of
-- one table per kind. exercise_log (0076) was created empty and is renamed;
-- an answer is now keyed by patient, kind and day.
-- See packages/db/src/checkin.ts and checkin-log.ts.

ALTER TABLE IF EXISTS "exercise_log" RENAME TO "checkin_log";
--> statement-breakpoint
ALTER TABLE "checkin_log" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'exercise' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "exercise_log_contact_day_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "checkin_log_contact_kind_day_unique" ON "checkin_log" ("contact_id", "kind", "for_date");
