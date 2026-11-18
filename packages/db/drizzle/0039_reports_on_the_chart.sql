-- A blood report belongs to the patient, not to their app account.
--
-- report.user_id was NOT NULL, so a report could only exist for somebody who
-- had signed up for the patient app. Most of this clinic's patients are
-- walk-ins with a chart, a patient id and no login at all — and a lab printout
-- is one of the main things the clinic works from. The Reports tab therefore
-- had nowhere to put the very reports it was built to show, and the upload
-- button was hidden for the majority of patients.
--
-- So the chart becomes the anchor, as it already is for visits, therapy days,
-- payments and receipts. The login stays on the row when there is one, because
-- that is how the patient sees it in their own app — it is just no longer what
-- makes the row legal.
--
-- Biomarkers and biological age are deliberately NOT moved. They are the
-- patient-app view — a score the patient reads on their own dashboard — and
-- the calculation is keyed on the account throughout. A report filed for a
-- chart with no login is stored and readable by the clinic; its markers start
-- being parsed the day that patient signs up.

ALTER TABLE "report"
  ADD COLUMN IF NOT EXISTS "patient_id" text;--> statement-breakpoint

ALTER TABLE "report"
  ADD CONSTRAINT "report_patient_id_patient_record_id_fk"
  FOREIGN KEY ("patient_id") REFERENCES "public"."patient_record"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Every existing report already belongs to an account; give it the chart that
-- account holds, so nothing is left addressed only one way.
UPDATE "report" r
SET "patient_id" = p."id"
FROM "patient_record" p
WHERE p."user_id" = r."user_id" AND r."patient_id" IS NULL;--> statement-breakpoint

ALTER TABLE "report" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "report_patient_idx" ON "report" ("patient_id");
