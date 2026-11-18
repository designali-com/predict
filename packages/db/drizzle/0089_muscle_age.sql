-- Muscle age, kept with the tests.
--
-- Every strength test that has a published reference gets the age at which
-- its result is the average for the patient's sex (its "muscle age") and where
-- it sits among people of their own age (percentile). Every ROM test gets its
-- range as a share of the normal range. All of it is worked out once, when the
-- test is saved, from the age and sex the patient had then — and kept, so a
-- report printed next year shows what was said on the day.
--
-- vald_assessment is one row per patient per clinic day: the muscle age of
-- that visit taken over every test that has a reference, and which tests went
-- into it — what the report leads with, and what a trend is drawn from.

ALTER TABLE "vald_test" ADD COLUMN IF NOT EXISTS "assessed_age" integer;
--> statement-breakpoint
ALTER TABLE "vald_test" ADD COLUMN IF NOT EXISTS "assessed_sex" text;
--> statement-breakpoint
ALTER TABLE "vald_test" ADD COLUMN IF NOT EXISTS "muscle_age" double precision;
--> statement-breakpoint
ALTER TABLE "vald_test" ADD COLUMN IF NOT EXISTS "strength_percentile" integer;
--> statement-breakpoint
ALTER TABLE "vald_test" ADD COLUMN IF NOT EXISTS "expected_newtons" double precision;
--> statement-breakpoint
ALTER TABLE "vald_test" ADD COLUMN IF NOT EXISTS "rom_percent_of_normal" double precision;
--> statement-breakpoint
ALTER TABLE "vald_test" ADD COLUMN IF NOT EXISTS "norm_source" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vald_assessment" (
  "id" text PRIMARY KEY,
  "patient_id" text NOT NULL REFERENCES "patient_record"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "appointment_id" text REFERENCES "appointment"("id") ON DELETE SET NULL,
  "actual_age" integer,
  "sex" text,
  "muscle_age" double precision,
  "grip_muscle_age" double precision,
  "grip_percentile" integer,
  "tests" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "computed_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vald_assessment_patient_day_unique" ON "vald_assessment" ("patient_id", "day");
