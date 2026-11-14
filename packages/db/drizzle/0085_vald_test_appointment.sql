-- A DynaMo test run in the clinic belongs to the consultation it was run at.
-- Nullable: tests synced from VALD's cloud have no visit of ours.

ALTER TABLE "vald_test" ADD COLUMN IF NOT EXISTS "appointment_id" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vald_test" ADD CONSTRAINT "vald_test_appointment_id_appointment_id_fk"
    FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vald_test_appointment_idx" ON "vald_test" ("appointment_id");
