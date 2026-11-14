-- Sittings are logged when the patient comes, and therapy is booked by the hour.
--
-- Until now starting a course wrote one dated "pending" row per day: 21 rows
-- for a 21-day course, starting tomorrow, every day including Sundays and
-- festivals. A patient who did not come had to be crossed out ("missed"), the
-- cross did not move anything along, and once every row was either done or
-- missed the course closed — with sittings still owed. Now a sitting row is
-- written only when the patient is actually treated, with their signature, and
-- a course is finished when it has as many done sittings as it was sold with.
-- Rows already written stay as history; only "done" ones count.
--
-- Booking moves off the doctor's diary onto an hour grid: the clinic treats so
-- many patients an hour, and that is what a caller is offered.

ALTER TABLE "plan_sitting" ADD COLUMN IF NOT EXISTS "signature_data_url" text;
--> statement-breakpoint
ALTER TABLE "plan_sitting" ADD COLUMN IF NOT EXISTS "signed_name" text;
--> statement-breakpoint
ALTER TABLE "plan_sitting" ADD COLUMN IF NOT EXISTS "signed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "plan_sitting" ADD COLUMN IF NOT EXISTS "booking_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "therapy_schedule" (
  "clinic_id" text PRIMARY KEY REFERENCES "clinic"("id") ON DELETE CASCADE,
  "open_hour" integer NOT NULL DEFAULT 10,
  "last_hour" integer NOT NULL DEFAULT 18,
  "capacity" integer NOT NULL DEFAULT 3,
  "closed_weekdays" text NOT NULL DEFAULT '0',
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "therapy_closed_day" (
  "id" text PRIMARY KEY,
  "clinic_id" text NOT NULL REFERENCES "clinic"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "reason" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "therapy_closed_day_unique" ON "therapy_closed_day" ("clinic_id", "day");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "therapy_booking" (
  "id" text PRIMARY KEY,
  "clinic_id" text REFERENCES "clinic"("id") ON DELETE SET NULL,
  "contact_id" text NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "enrollment_id" text REFERENCES "plan_enrollment"("id") ON DELETE SET NULL,
  "starts_at" timestamp NOT NULL,
  "status" text NOT NULL DEFAULT 'booked',
  "sitting_id" text REFERENCES "plan_sitting"("id") ON DELETE SET NULL,
  "note" text,
  "created_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "therapy_booking_clinic_start_idx" ON "therapy_booking" ("clinic_id", "starts_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "therapy_booking_contact_idx" ON "therapy_booking" ("contact_id", "starts_at");
--> statement-breakpoint
INSERT INTO "therapy_schedule" ("clinic_id") SELECT "id" FROM "clinic" ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- A course closed by crossing out the days it still owed is open again.
UPDATE "plan_enrollment" e SET "status" = 'active', "updated_at" = now()
WHERE e."status" = 'completed'
  AND NOT e."is_per_session"
  AND (SELECT count(*) FROM "plan_sitting" s WHERE s."enrollment_id" = e."id" AND s."status" = 'done') < e."sittings";
