-- The new-patient journey: registration, consultation fee, doctor, package,
-- nutritionist, plan payment.
--
-- Three things this adds:
--
--   1. A consultation fee on each appointment (default ₹1,500, editable) and a
--      payment ledger. The fee is the gate — a visit with it outstanding does
--      not reach the doctor's panel.
--   2. An advance percentage on every plan. Treatment plans can be paid in
--      instalments, but the course cannot start below the advance.
--   3. Somewhere to keep the clinic's paper forms: registration, questionnaire,
--      measurements, provisional diagnosis, nutrition consult. Answers are
--      JSONB against a definition that lives in code, because these are printed
--      documents the clinic revises and a new question must not be a migration.
--
-- plan_enrollment.start_date becomes nullable in the same breath: a plan the
-- doctor has prescribed but nobody has paid for has no schedule yet, and that
-- absence is the whole difference between "prescribed" and "active".

ALTER TABLE "appointment"
  ADD COLUMN IF NOT EXISTS "fee_in_paise" integer DEFAULT 150000 NOT NULL;--> statement-breakpoint

ALTER TABLE "treatment_plan"
  ADD COLUMN IF NOT EXISTS "advance_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "plan_enrollment"
  ADD COLUMN IF NOT EXISTS "advance_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "plan_enrollment"
  ADD COLUMN IF NOT EXISTS "prescribed_at_appointment_id" text;--> statement-breakpoint

ALTER TABLE "plan_enrollment"
  ADD COLUMN IF NOT EXISTS "prescribed_by_user_id" text;--> statement-breakpoint

ALTER TABLE "plan_enrollment"
  ADD COLUMN IF NOT EXISTS "activated_at" timestamp;--> statement-breakpoint

ALTER TABLE "plan_enrollment"
  ALTER COLUMN "start_date" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "plan_enrollment"
  ADD CONSTRAINT "plan_enrollment_prescribed_at_appointment_id_appointment_id_fk"
  FOREIGN KEY ("prescribed_at_appointment_id") REFERENCES "public"."appointment"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "plan_enrollment"
  ADD CONSTRAINT "plan_enrollment_prescribed_by_user_id_user_id_fk"
  FOREIGN KEY ("prescribed_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Courses that already exist were sold and started at the desk in one step, so
-- they are active with nothing outstanding. Marking them activated keeps the
-- derived stage honest rather than reporting them as awaiting payment.
UPDATE "plan_enrollment"
SET "activated_at" = "created_at"
WHERE "activated_at" IS NULL AND "status" = 'active';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payment" (
  "id" text PRIMARY KEY NOT NULL,
  "contact_id" text NOT NULL,
  "kind" text NOT NULL,
  "appointment_id" text,
  "enrollment_id" text,
  "amount_in_paise" integer NOT NULL,
  "method" text DEFAULT 'cash' NOT NULL,
  "reference" text,
  "note" text,
  -- Voided, never deleted: a payment entered against the wrong patient is a
  -- mistake somebody has to be able to see afterwards.
  "voided_at" timestamp,
  "void_reason" text,
  "collected_by_user_id" text,
  "collected_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_contact_id_contact_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- SET NULL, not cascade: deleting a booking must not erase the record that
-- money changed hands.
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_appointment_id_appointment_id_fk"
  FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_enrollment_id_plan_enrollment_id_fk"
  FOREIGN KEY ("enrollment_id") REFERENCES "public"."plan_enrollment"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_collected_by_user_id_user_id_fk"
  FOREIGN KEY ("collected_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "payment_contact_idx" ON "payment" ("contact_id", "collected_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_appointment_idx" ON "payment" ("appointment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_enrollment_idx" ON "payment" ("enrollment_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "clinical_form_submission" (
  "id" text PRIMARY KEY NOT NULL,
  "contact_id" text NOT NULL,
  "appointment_id" text,
  "form_key" text NOT NULL,
  "form_version" integer DEFAULT 1 NOT NULL,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "submitted_at" timestamp,
  "submitted_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "clinical_form_submission"
  ADD CONSTRAINT "clinical_form_submission_contact_id_contact_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "clinical_form_submission"
  ADD CONSTRAINT "clinical_form_submission_appointment_id_appointment_id_fk"
  FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "clinical_form_submission"
  ADD CONSTRAINT "clinical_form_submission_submitted_by_user_id_user_id_fk"
  FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "clinical_form_contact_idx"
  ON "clinical_form_submission" ("contact_id", "form_key");--> statement-breakpoint

-- One of each form per visit. Without this a double-submitted page becomes two
-- answers to the same questions and nothing can say which is current.
CREATE UNIQUE INDEX IF NOT EXISTS "clinical_form_visit_key_unique"
  ON "clinical_form_submission" ("appointment_id", "form_key")
  WHERE "appointment_id" IS NOT NULL;
