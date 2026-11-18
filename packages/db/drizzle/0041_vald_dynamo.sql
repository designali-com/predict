-- VALD DynaMo: muscle strength testing.
--
-- Tests are run in VALD's own phone app against a "profile" held in VALD's
-- cloud. Nothing about that profile can be matched to our patients on its own:
-- VALD stores a name, a date of birth, a sex and an email, and no phone number
-- at all. The join therefore has to be an identifier we put there ourselves and
-- keep here, which is what vald_profile_id is.

ALTER TABLE "patient_record" ADD COLUMN IF NOT EXISTS "vald_profile_id" text;
--> statement-breakpoint
ALTER TABLE "patient_record" ADD COLUMN IF NOT EXISTS "vald_linked_at" timestamp;
--> statement-breakpoint

-- One VALD profile belongs to at most one chart. Two charts pointing at the
-- same profile would silently merge two people's strength history.
CREATE UNIQUE INDEX IF NOT EXISTS "patient_record_vald_profile_id_idx"
  ON "patient_record" ("vald_profile_id");
--> statement-breakpoint

-- Results are cached rather than fetched live on every page open. Two reasons:
-- the history has to survive a profile being deleted or re-pointed in VALD, and
-- a clinical page must still render when a third-party API is down.
CREATE TABLE IF NOT EXISTS "vald_test" (
  -- VALD's own test id, so re-syncing the same test updates rather than
  -- appending a duplicate.
  "id" text PRIMARY KEY NOT NULL,
  "patient_id" text NOT NULL REFERENCES "patient_record"("id") ON DELETE CASCADE,
  "vald_profile_id" text NOT NULL,
  "test_category" text,
  "body_region" text,
  "movement" text,
  "position" text,
  "laterality" text,
  "tested_at" timestamp NOT NULL,
  "duration_seconds" double precision,
  -- Peak force per side, in newtons as the device reports it. Converted to
  -- kilograms for display only: storing the converted number would bake a
  -- rounding into the record.
  "left_max_force_newtons" double precision,
  "right_max_force_newtons" double precision,
  "left_rom_degrees" double precision,
  "right_rom_degrees" double precision,
  -- Left/right difference as VALD calculates it. Kept as sent rather than
  -- recomputed, so our number always agrees with the VALD Hub report.
  "asymmetry_percent" double precision,
  -- The untouched payload. VALD adds metrics between API versions, and this
  -- means a new one is readable without a migration first.
  "raw" jsonb,
  "synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vald_test_patient_id_idx" ON "vald_test" ("patient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vald_test_tested_at_idx" ON "vald_test" ("tested_at");
