-- Care plan: what a patient has actually been told to take or do.
--
-- adherence_log could only ever record "medication: done" — never which
-- medication, how much, or who prescribed it. With no prescribed set there is
-- no denominator, so nothing could be computed from those rows: no percentage,
-- no missed dose, no trend. Everything below exists to supply that denominator.
--
-- Hand-authored in the style of 0006/0007: drizzle-kit's snapshot stopped at
-- 0005, so `generate` reads the intervening hand-written changes as drops and
-- asks to disambiguate renames interactively.
--
-- Additive only. Every new column on adherence_log is nullable, so existing
-- rows stay valid and keep meaning what they always meant — an entry with no
-- care_plan_item_id counts as activity but toward no item's percentage,
-- because there is genuinely nothing to divide it by.

CREATE TABLE IF NOT EXISTS "care_plan_item" (
  "id" text PRIMARY KEY NOT NULL,
  "contact_id" text NOT NULL,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "instructions" text,
  -- Which times of day this is due, e.g. ["morning","evening"]. Its length is
  -- the expected doses per day, which every adherence percentage divides by.
  "slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "assigned_by_user_id" text,
  "assigned_role" text,
  "start_date" date NOT NULL,
  -- Null means open-ended. Setting it stops the item counting against
  -- adherence without deleting it, so past days stay scored as they were.
  "end_date" date,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "care_plan_item"
  ADD CONSTRAINT "care_plan_item_contact_id_contact_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "care_plan_item"
  ADD CONSTRAINT "care_plan_item_assigned_by_user_id_user_id_fk"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "care_plan_item_contact_active_idx"
  ON "care_plan_item" ("contact_id", "is_active");--> statement-breakpoint

ALTER TABLE "adherence_log" ADD COLUMN IF NOT EXISTS "care_plan_item_id" text;--> statement-breakpoint
ALTER TABLE "adherence_log" ADD COLUMN IF NOT EXISTS "slot" text;--> statement-breakpoint

-- The day this counts *for*, which is not when it was recorded: an evening
-- dose logged at 00:20 belongs to the previous day, and a coach catching up
-- backfills yesterday. logged_at alone would silently move both.
ALTER TABLE "adherence_log" ADD COLUMN IF NOT EXISTS "logged_for_date" date;--> statement-breakpoint

ALTER TABLE "adherence_log"
  ADD CONSTRAINT "adherence_log_care_plan_item_id_care_plan_item_id_fk"
  FOREIGN KEY ("care_plan_item_id") REFERENCES "public"."care_plan_item"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Backfill so existing rows land on a day rather than nowhere. logged_at is
-- the best evidence available for rows written before the distinction existed.
UPDATE "adherence_log"
   SET "logged_for_date" = "logged_at"::date
 WHERE "logged_for_date" IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "adherence_log_contact_date_idx"
  ON "adherence_log" ("contact_id", "logged_for_date");--> statement-breakpoint

-- One entry per item per slot per day, so a re-report corrects the existing
-- row instead of inflating the count above what was ever prescribed. Partial
-- because the pre-care-plan rows have neither column and must stay.
CREATE UNIQUE INDEX IF NOT EXISTS "adherence_log_item_slot_day_unique"
  ON "adherence_log" ("care_plan_item_id", "slot", "logged_for_date")
  WHERE "care_plan_item_id" IS NOT NULL AND "logged_for_date" IS NOT NULL;
