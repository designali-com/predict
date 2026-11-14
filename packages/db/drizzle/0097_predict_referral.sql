-- A clinic's patient referred to Predict for diagnosis: blood tests and
-- biomarkers, muscle age (VALD), biological age, wearables. The patient stays
-- the clinic's; the referral is what makes them Predict's too. It records who
-- consented to what and when, and is the moment the predict.fit login is made.
CREATE TABLE IF NOT EXISTS "predict_referral" (
  "id" text PRIMARY KEY NOT NULL,
  "patient_id" text NOT NULL REFERENCES "patient_record"("id") ON DELETE cascade,
  "contact_id" text REFERENCES "contact"("id") ON DELETE set null,
  "clinic_id" text NOT NULL REFERENCES "clinic"("id") ON DELETE cascade,
  "services" text[] NOT NULL,
  "status" text NOT NULL DEFAULT 'referred',
  "note" text,
  "consent_at" timestamp NOT NULL,
  "consent_by_user_id" text REFERENCES "user"("id") ON DELETE set null,
  "created_by_user_id" text REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  "updated_at" timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "predict_referral_patient_idx" ON "predict_referral" ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "predict_referral_clinic_idx" ON "predict_referral" ("clinic_id", "status");
