-- Sitting plans: what OPTM sells, who is on one, and whether each day happened.
--
-- Attending a consultation was making somebody a PATIENT. It should not: they
-- can come once and never return. Buying a course is the moment there is a
-- schedule with their name on it, so that is where the promotion moves to (see
-- appointment-outcome.ts).
--
-- Three tables: the catalogue, an enrolment, and one row per day of that
-- enrolment. The day rows are the log sheet — in-clinic days point at their
-- appointment, at-home days are ticked by the patient, and both are the same
-- row so nothing can disagree about whether day 9 happened.

CREATE TABLE IF NOT EXISTS "treatment_plan" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "limbs" text NOT NULL,
  "duration_days" integer NOT NULL,
  "sittings" integer NOT NULL,
  -- Paise. Integer money: a plan priced by floating point reaches an invoice
  -- as 24999.99999.
  "price_in_paise" integer DEFAULT 0 NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "treatment_plan"
  ADD CONSTRAINT "treatment_plan_created_by_user_id_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "treatment_plan_active_idx"
  ON "treatment_plan" ("is_active", "sort_order");--> statement-breakpoint

-- One plan per shape, so the picker cannot fill with three identical
-- "Four limbs 21 day" rows nobody can tell apart.
CREATE UNIQUE INDEX IF NOT EXISTS "treatment_plan_shape_unique"
  ON "treatment_plan" ("limbs", "duration_days", "name");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plan_enrollment" (
  "id" text PRIMARY KEY NOT NULL,
  "contact_id" text NOT NULL,
  "treatment_plan_id" text,
  -- Snapshot of what was bought, at the price paid. Repricing the catalogue
  -- must not rewrite what an existing patient was charged.
  "plan_name" text NOT NULL,
  "limbs" text NOT NULL,
  "duration_days" integer NOT NULL,
  "sittings" integer NOT NULL,
  "price_in_paise" integer DEFAULT 0 NOT NULL,
  "start_date" date NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "notes" text,
  "enrolled_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "plan_enrollment"
  ADD CONSTRAINT "plan_enrollment_contact_id_contact_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- SET NULL, not cascade: retiring a plan someone was sold must not delete the
-- treatment they actually received.
ALTER TABLE "plan_enrollment"
  ADD CONSTRAINT "plan_enrollment_treatment_plan_id_treatment_plan_id_fk"
  FOREIGN KEY ("treatment_plan_id") REFERENCES "public"."treatment_plan"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "plan_enrollment"
  ADD CONSTRAINT "plan_enrollment_enrolled_by_user_id_user_id_fk"
  FOREIGN KEY ("enrolled_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plan_enrollment_contact_idx"
  ON "plan_enrollment" ("contact_id", "status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plan_sitting" (
  "id" text PRIMARY KEY NOT NULL,
  "enrollment_id" text NOT NULL,
  "contact_id" text NOT NULL,
  "day_number" integer NOT NULL,
  "planned_date" date NOT NULL,
  "mode" text DEFAULT 'in_clinic' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "appointment_id" text,
  "completed_at" timestamp,
  "logged_source" text,
  "logged_by_user_id" text,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "plan_sitting"
  ADD CONSTRAINT "plan_sitting_enrollment_id_plan_enrollment_id_fk"
  FOREIGN KEY ("enrollment_id") REFERENCES "public"."plan_enrollment"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "plan_sitting"
  ADD CONSTRAINT "plan_sitting_contact_id_contact_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- SET NULL: deleting a booking must not delete the record that the therapy day
-- existed. The day is the fact; the appointment is only how it was arranged.
ALTER TABLE "plan_sitting"
  ADD CONSTRAINT "plan_sitting_appointment_id_appointment_id_fk"
  FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "plan_sitting"
  ADD CONSTRAINT "plan_sitting_logged_by_user_id_user_id_fk"
  FOREIGN KEY ("logged_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plan_sitting_contact_date_idx"
  ON "plan_sitting" ("contact_id", "planned_date");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plan_sitting_enrollment_idx"
  ON "plan_sitting" ("enrollment_id", "day_number");--> statement-breakpoint

-- Day 7 exists once per course. Without this a double-submitted enrolment form
-- silently doubles somebody's sittings.
CREATE UNIQUE INDEX IF NOT EXISTS "plan_sitting_enrollment_day_unique"
  ON "plan_sitting" ("enrollment_id", "day_number");--> statement-breakpoint

-- The six plans the clinic sells today, so the settings page opens onto
-- something rather than an empty state that has to be filled in before anyone
-- can be enrolled. Prices are placeholders — they are meant to be edited.
INSERT INTO "treatment_plan"
  ("id", "name", "limbs", "duration_days", "sittings", "price_in_paise", "sort_order", "description")
VALUES
  (gen_random_uuid()::text, 'Two Limbs 6 Day',   'two',  6,  6,  0, 10, 'Short course — two limbs, six sittings.'),
  (gen_random_uuid()::text, 'Two Limbs 21 Day',  'two',  21, 21, 0, 20, 'Standard course — two limbs, twenty-one sittings.'),
  (gen_random_uuid()::text, 'Two Limbs 42 Day',  'two',  42, 42, 0, 30, 'Extended course — two limbs, forty-two sittings.'),
  (gen_random_uuid()::text, 'Four Limbs 6 Day',  'four', 6,  6,  0, 40, 'Short course — four limbs, six sittings.'),
  (gen_random_uuid()::text, 'Four Limbs 21 Day', 'four', 21, 21, 0, 50, 'Standard course — four limbs, twenty-one sittings.'),
  (gen_random_uuid()::text, 'Four Limbs 42 Day', 'four', 42, 42, 0, 60, 'Extended course — four limbs, forty-two sittings.')
ON CONFLICT ("limbs", "duration_days", "name") DO NOTHING;
