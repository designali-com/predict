-- A plan is a bill, not a price.
--
-- The clinic's own package sheet lists five lines per package — a medicine
-- combo, Phyto Proflex, Morn Blossom sachets, Phyto Crystal, and Treatment —
-- each with a rate and a quantity, and the net payable is their sum. The first
-- cut of treatment_plan carried a single price column, which loses the
-- quantities. Those are the part the patient is actually handed: ten sachets on
-- a 6-day course, fifty on a 42-day one, and nothing could be reconciled
-- against what was dispensed.
--
-- The Treatment line is the sittings: its quantity is 6, 21 or 42, the same
-- number the log sheet lays out. treatment_plan.sittings is kept in step with
-- it rather than typed in separately.
--
-- The six real packages are seeded below at the clinic's current prices,
-- replacing the placeholder rows from 0023. Safe to replace outright: nobody
-- has been enrolled on one yet, and the insert is guarded on that being true.

CREATE TABLE IF NOT EXISTS "treatment_plan_item" (
  "id" text PRIMARY KEY NOT NULL,
  "plan_id" text NOT NULL,
  "kind" text DEFAULT 'medicine' NOT NULL,
  "name" text NOT NULL,
  "rate_in_paise" integer DEFAULT 0 NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "treatment_plan_item"
  ADD CONSTRAINT "treatment_plan_item_plan_id_treatment_plan_id_fk"
  FOREIGN KEY ("plan_id") REFERENCES "public"."treatment_plan"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "treatment_plan_item_plan_idx"
  ON "treatment_plan_item" ("plan_id", "sort_order");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plan_enrollment_item" (
  "id" text PRIMARY KEY NOT NULL,
  "enrollment_id" text NOT NULL,
  "kind" text DEFAULT 'medicine' NOT NULL,
  "name" text NOT NULL,
  "rate_in_paise" integer DEFAULT 0 NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  -- "If your body requires extra medicine then you have to buy extra flat
  -- cost" — the note at the bottom of the clinic's sheet. Marked rather than
  -- mixed in, so the package price stays quotable.
  "is_extra" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "added_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "plan_enrollment_item"
  ADD CONSTRAINT "plan_enrollment_item_enrollment_id_plan_enrollment_id_fk"
  FOREIGN KEY ("enrollment_id") REFERENCES "public"."plan_enrollment"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "plan_enrollment_item"
  ADD CONSTRAINT "plan_enrollment_item_added_by_user_id_user_id_fk"
  FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "plan_enrollment_item_enrollment_idx"
  ON "plan_enrollment_item" ("enrollment_id", "sort_order");--> statement-breakpoint

-- Out with the placeholders. Guarded: if anybody has been enrolled since 0023,
-- this deletes nothing and the seed below is skipped by ON CONFLICT.
DELETE FROM "treatment_plan"
WHERE "price_in_paise" = 0
  AND NOT EXISTS (SELECT 1 FROM "plan_enrollment");--> statement-breakpoint

-- The six packages, at the rates on the clinic's sheet. Two limbs and four
-- limbs differ in exactly two places: the combo (2 BHT vs 2-JP) and the
-- treatment rate (₹1,500 vs ₹2,200 per sitting).
INSERT INTO "treatment_plan"
  ("id", "name", "limbs", "duration_days", "sittings", "price_in_paise", "sort_order", "description")
VALUES
  ('plan_two_6',   'Two Limbs 6 Day',   'two',  6,  6,  1818000, 10, 'Upper and/or lower limbs — 6 sittings.'),
  ('plan_two_21',  'Two Limbs 21 Day',  'two',  21, 21, 6745500, 20, 'Upper and/or lower limbs — 21 sittings.'),
  ('plan_two_42',  'Two Limbs 42 Day',  'two',  42, 42, 12537000, 30, 'Upper and/or lower limbs — 42 sittings.'),
  ('plan_four_6',  'Four Limbs 6 Day',  'four', 6,  6,  2238000, 40, 'Neck, back and legs — 6 sittings.'),
  ('plan_four_21', 'Four Limbs 21 Day', 'four', 21, 21, 8575500, 50, 'Neck, back and legs — 21 sittings.'),
  ('plan_four_42', 'Four Limbs 42 Day', 'four', 42, 42, 17151000, 60, 'Neck, back and legs — 42 sittings.')
ON CONFLICT ("limbs", "duration_days", "name") DO NOTHING;--> statement-breakpoint

-- The lines behind each of those totals. Rates are in paise; every net below
-- is the sum of rate × quantity down its column, matching the printed sheet.
INSERT INTO "treatment_plan_item"
  ("id", "plan_id", "kind", "name", "rate_in_paise", "quantity", "sort_order")
VALUES
  -- Two limbs, 6 days — net ₹18,180 over 19 units
  (gen_random_uuid()::text, 'plan_two_6',  'medicine',  '(2 BHT + LL + NPF-1) Combo', 558000, 1,  10),
  (gen_random_uuid()::text, 'plan_two_6',  'medicine',  'Phyto Proflex',              162000, 1,  20),
  (gen_random_uuid()::text, 'plan_two_6',  'medicine',  'Morn Blossom Sachet',          9900, 10, 30),
  (gen_random_uuid()::text, 'plan_two_6',  'medicine',  'Phyto Crystal',               99000, 1,  40),
  (gen_random_uuid()::text, 'plan_two_6',  'treatment', 'Treatment',                  150000, 6,  50),

  -- Two limbs, 21 days — net ₹67,455 over 56 units
  (gen_random_uuid()::text, 'plan_two_21', 'medicine',  '(2 BHT + LL + NPF-1) Combo', 558000, 5,  10),
  (gen_random_uuid()::text, 'plan_two_21', 'medicine',  'Phyto Proflex',              162000, 1,  20),
  (gen_random_uuid()::text, 'plan_two_21', 'medicine',  'Morn Blossom Sachet',          9900, 25, 30),
  (gen_random_uuid()::text, 'plan_two_21', 'medicine',  'Phyto Crystal',               99000, 4,  40),
  (gen_random_uuid()::text, 'plan_two_21', 'treatment', 'Treatment',                  150000, 21, 50),

  -- Two limbs, 42 days — net ₹1,25,370 over 107 units
  (gen_random_uuid()::text, 'plan_two_42', 'medicine',  '(2 BHT + LL + NPF-1) Combo', 558000, 9,  10),
  (gen_random_uuid()::text, 'plan_two_42', 'medicine',  'Phyto Proflex',              162000, 2,  20),
  (gen_random_uuid()::text, 'plan_two_42', 'medicine',  'Morn Blossom Sachet',          9900, 50, 30),
  (gen_random_uuid()::text, 'plan_two_42', 'medicine',  'Phyto Crystal',               99000, 4,  40),
  (gen_random_uuid()::text, 'plan_two_42', 'treatment', 'Treatment',                  150000, 42, 50),

  -- Four limbs, 6 days — net ₹22,380 over 19 units
  (gen_random_uuid()::text, 'plan_four_6',  'medicine',  '(2-JP + LL + NPF-1) Combo', 558000, 1,  10),
  (gen_random_uuid()::text, 'plan_four_6',  'medicine',  'Phyto Proflex',             162000, 1,  20),
  (gen_random_uuid()::text, 'plan_four_6',  'medicine',  'Morn Blossom Sachet',         9900, 10, 30),
  (gen_random_uuid()::text, 'plan_four_6',  'medicine',  'Phyto Crystal',              99000, 1,  40),
  (gen_random_uuid()::text, 'plan_four_6',  'treatment', 'Treatment',                 220000, 6,  50),

  -- Four limbs, 21 days — net ₹85,755 over 55 units
  (gen_random_uuid()::text, 'plan_four_21', 'medicine',  '(2-JP + LL + NPF-1) Combo', 558000, 6,  10),
  (gen_random_uuid()::text, 'plan_four_21', 'medicine',  'Phyto Proflex',             162000, 1,  20),
  (gen_random_uuid()::text, 'plan_four_21', 'medicine',  'Morn Blossom Sachet',         9900, 25, 30),
  (gen_random_uuid()::text, 'plan_four_21', 'medicine',  'Phyto Crystal',              99000, 2,  40),
  (gen_random_uuid()::text, 'plan_four_21', 'treatment', 'Treatment',                 220000, 21, 50),

  -- Four limbs, 42 days — net ₹1,71,510 over 110 units
  (gen_random_uuid()::text, 'plan_four_42', 'medicine',  '(2-JP + LL + NPF-1) Combo', 558000, 12, 10),
  (gen_random_uuid()::text, 'plan_four_42', 'medicine',  'Phyto Proflex',             162000, 2,  20),
  (gen_random_uuid()::text, 'plan_four_42', 'medicine',  'Morn Blossom Sachet',         9900, 50, 30),
  (gen_random_uuid()::text, 'plan_four_42', 'medicine',  'Phyto Crystal',              99000, 4,  40),
  (gen_random_uuid()::text, 'plan_four_42', 'treatment', 'Treatment',                 220000, 42, 50)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- The cached net has to equal the lines it was typed alongside, or the first
-- edit to either makes the catalogue quote a price the bill does not support.
-- Recomputed here so the seed cannot be wrong, and by the API on every save.
UPDATE "treatment_plan" p
SET "price_in_paise" = agg."net",
    "sittings" = GREATEST(agg."sittings", 1)
FROM (
  SELECT "plan_id",
         sum("rate_in_paise" * "quantity")::int AS "net",
         coalesce(sum("quantity") FILTER (WHERE "kind" = 'treatment'), 0)::int AS "sittings"
  FROM "treatment_plan_item"
  GROUP BY "plan_id"
) agg
WHERE agg."plan_id" = p."id";
