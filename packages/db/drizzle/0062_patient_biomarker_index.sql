-- Which composite index a patient's biological age is built from.
--
-- One per patient, chosen by the clinic. Null means "the default", which is
-- CBLAI (see src/patient-index.ts) — kept null rather than written out on
-- every chart so that a patient nobody has made a decision about follows the
-- default, and one somebody has chosen for keeps that choice.
--
-- SET NULL on delete: removing an index from the catalogue drops its
-- patients back to the default instead of taking their charts with it.

ALTER TABLE "patient_record"
  ADD COLUMN IF NOT EXISTS "biomarker_index_id" text
  REFERENCES "biomarker_index"("id") ON DELETE SET NULL;
