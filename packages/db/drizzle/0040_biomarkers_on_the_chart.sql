-- Biomarkers, biological age, and what a blood test costs.
--
-- Three things at once, because they are one change:
--
-- 1. Readings and results move onto the chart, for the same reason the report
--    did in 0039. A clinic types a lab's numbers in for a patient who has
--    never opened the app — that is the normal case, not the exception — and
--    both tables were NOT NULL on user_id, so those numbers had nowhere to go
--    and no biological age could be calculated for them.
--
--    The account stays on the row when there is one: it is how the patient
--    reads their own score. It is no longer what makes the row legal.
--
-- 2. Every biomarker gets a price. A blood panel is billed per marker — the
--    clinic picks which ones to run and the total follows from that — so the
--    price belongs on the biomarker, not in a single "blood test" fee that
--    would be wrong the moment a panel changes.
--
-- 3. A reading records which panel it came from, so "compare with the last
--    blood report" is a question about two drawings of blood rather than
--    about whichever rows happen to sit next to each other in time.

ALTER TABLE "biomarker_reading"
  ADD COLUMN IF NOT EXISTS "patient_id" text,
  -- When the blood was actually drawn, which is not when somebody typed it in.
  -- Comparing panels by entry time would put a back-dated report in the wrong
  -- order against the one before it.
  ADD COLUMN IF NOT EXISTS "collected_on" date;--> statement-breakpoint

ALTER TABLE "biomarker_reading"
  ADD CONSTRAINT "biomarker_reading_patient_id_patient_record_id_fk"
  FOREIGN KEY ("patient_id") REFERENCES "public"."patient_record"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

UPDATE "biomarker_reading" r
SET "patient_id" = p."id"
FROM "patient_record" p
WHERE p."user_id" = r."user_id" AND r."patient_id" IS NULL;--> statement-breakpoint

ALTER TABLE "biomarker_reading" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "biomarker_reading_patient_idx"
  ON "biomarker_reading" ("patient_id", "recorded_at");--> statement-breakpoint

ALTER TABLE "biological_age_result"
  ADD COLUMN IF NOT EXISTS "patient_id" text;--> statement-breakpoint

ALTER TABLE "biological_age_result"
  ADD CONSTRAINT "biological_age_result_patient_id_patient_record_id_fk"
  FOREIGN KEY ("patient_id") REFERENCES "public"."patient_record"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

UPDATE "biological_age_result" r
SET "patient_id" = p."id"
FROM "patient_record" p
WHERE p."user_id" = r."user_id" AND r."patient_id" IS NULL;--> statement-breakpoint

ALTER TABLE "biological_age_result" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "biological_age_result_patient_idx"
  ON "biological_age_result" ("patient_id", "calculated_at");--> statement-breakpoint

-- What each marker costs to run.
--
-- Left at zero rather than filled in with guesses: what a lab charges for
-- CTX-II is a fact the clinic has and this file does not, and a made-up price
-- would be quietly charged to a patient. Set them on the Biomarkers page.
ALTER TABLE "biomarker"
  ADD COLUMN IF NOT EXISTS "price_in_paise" integer DEFAULT 0 NOT NULL;
