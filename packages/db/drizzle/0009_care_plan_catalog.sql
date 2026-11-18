-- The clinic's own pick-list of things it prescribes.
--
-- Follow-up to 0008. Assigning previously meant typing the name out per
-- patient, which produces "Vitamin D3 5000 IU", "vitamin d3 5000iu" and
-- "Vit D3" as three unrelated strings — impossible to report on, and easy to
-- fat-finger a dose into.
--
-- care_plan_item keeps its own `name` rather than reading through the FK: the
-- assignment is a snapshot of what the patient was actually told. Renaming a
-- catalogue entry a year later must not silently rewrite a past prescription,
-- and an off-list item must still be possible, so catalog_item_id is nullable.
--
-- Hand-authored in the style of 0006–0008. Additive only.

CREATE TABLE IF NOT EXISTS "care_plan_catalog_item" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "name" text NOT NULL,
  -- Pre-filled into an assignment and still editable there: the same
  -- supplement is genuinely taken differently by different people.
  "default_instructions" text,
  "default_slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
  -- Retiring an entry hides it from the picker but leaves it resolvable from
  -- the plans that already reference it.
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "care_plan_catalog_item_type_idx"
  ON "care_plan_catalog_item" ("type", "is_active");--> statement-breakpoint

-- One entry per name per type, so re-running the seed cannot fill the picker
-- with the same thing twice.
CREATE UNIQUE INDEX IF NOT EXISTS "care_plan_catalog_item_type_name_unique"
  ON "care_plan_catalog_item" ("type", "name");--> statement-breakpoint

ALTER TABLE "care_plan_item" ADD COLUMN IF NOT EXISTS "catalog_item_id" text;--> statement-breakpoint

ALTER TABLE "care_plan_item"
  ADD CONSTRAINT "care_plan_item_catalog_item_id_care_plan_catalog_item_id_fk"
  FOREIGN KEY ("catalog_item_id") REFERENCES "public"."care_plan_catalog_item"("id")
  ON DELETE set null ON UPDATE no action;
