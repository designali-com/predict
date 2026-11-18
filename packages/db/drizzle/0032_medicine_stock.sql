-- Medicine stock: what is on the shelf, what went out, and what tomorrow needs.
--
-- Medicines existed only as free text on treatment_plan_item — "Phyto Proflex"
-- typed once per package — so nothing could count them or say there were four
-- sachets left. This makes the medicine a thing, points the plan lines at it,
-- and records every movement.
--
-- What is on hand is the SUM of stock_movement, never a column somebody
-- increments. A mutable counter and a movement history disagree the first time
-- an update is missed or applied twice, and the disagreement is silent — you
-- find it during a physical count months later with no way to say which entry
-- was wrong.

CREATE TABLE IF NOT EXISTS "medicine" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "sku" text,
  "unit" text DEFAULT 'piece' NOT NULL,
  -- How much one therapy session uses. Null means it is not consumed per
  -- session — handed over as a pack instead — so it stays out of the forecast.
  "per_sitting_qty" double precision,
  "reorder_level" double precision DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "medicine_name_unique" ON "medicine" ("name");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stock_movement" (
  "id" text PRIMARY KEY NOT NULL,
  "medicine_id" text NOT NULL,
  "kind" text NOT NULL,
  -- Signed: positive in, negative out. One column so the balance is a plain
  -- sum and nothing has to remember which way each kind points.
  "quantity" double precision NOT NULL,
  "contact_id" text,
  "enrollment_id" text,
  "sitting_id" text,
  "batch_no" text,
  "expires_on" date,
  "unit_cost_in_paise" integer,
  "note" text,
  "actor_user_id" text,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "stock_movement"
  ADD CONSTRAINT "stock_movement_medicine_id_medicine_id_fk"
  FOREIGN KEY ("medicine_id") REFERENCES "public"."medicine"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "stock_movement"
  ADD CONSTRAINT "stock_movement_contact_id_contact_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "stock_movement"
  ADD CONSTRAINT "stock_movement_enrollment_id_plan_enrollment_id_fk"
  FOREIGN KEY ("enrollment_id") REFERENCES "public"."plan_enrollment"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "stock_movement"
  ADD CONSTRAINT "stock_movement_sitting_id_plan_sitting_id_fk"
  FOREIGN KEY ("sitting_id") REFERENCES "public"."plan_sitting"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "stock_movement"
  ADD CONSTRAINT "stock_movement_actor_user_id_user_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "stock_movement_medicine_idx"
  ON "stock_movement" ("medicine_id", "occurred_at");--> statement-breakpoint

-- One consumption per medicine per therapy day. Re-marking a sitting done after
-- a correction must not draw the stock down a second time.
CREATE UNIQUE INDEX IF NOT EXISTS "stock_movement_sitting_medicine_unique"
  ON "stock_movement" ("sitting_id", "medicine_id")
  WHERE "sitting_id" IS NOT NULL;--> statement-breakpoint

-- The plan lines point at the stock item, so "what is this patient on" and
-- "what is on the shelf" become the same question.
ALTER TABLE "treatment_plan_item" ADD COLUMN IF NOT EXISTS "medicine_id" text;--> statement-breakpoint
ALTER TABLE "plan_enrollment_item" ADD COLUMN IF NOT EXISTS "medicine_id" text;--> statement-breakpoint

ALTER TABLE "treatment_plan_item"
  ADD CONSTRAINT "treatment_plan_item_medicine_id_medicine_id_fk"
  FOREIGN KEY ("medicine_id") REFERENCES "public"."medicine"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "plan_enrollment_item"
  ADD CONSTRAINT "plan_enrollment_item_medicine_id_medicine_id_fk"
  FOREIGN KEY ("medicine_id") REFERENCES "public"."medicine"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- The five medicines already named across the packages, so the stock page opens
-- onto the clinic's actual list rather than an empty table.
--
-- per_sitting_qty is deliberately left NULL on all of them: how much of each is
-- used in one therapy session is a clinical number the clinic has yet to give,
-- and a guess here would produce a forecast that looks authoritative and is not.
-- Until it is filled in, a medicine is treated as dispensed rather than consumed.
INSERT INTO "medicine" ("id", "name", "unit", "reorder_level")
SELECT gen_random_uuid()::text, m."name", m."unit", 0
FROM (VALUES
  ('(2 BHT + LL + NPF-1) Combo', 'piece'),
  ('(2-JP + LL + NPF-1) Combo',  'piece'),
  ('Phyto Proflex',              'piece'),
  ('Morn Blossom Sachet',        'sachet'),
  ('Phyto Crystal',              'piece')
) AS m("name", "unit")
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint

-- Point the existing package lines at them, by the name they were typed under.
UPDATE "treatment_plan_item" i
SET "medicine_id" = m."id"
FROM "medicine" m
WHERE m."name" = i."name" AND i."kind" = 'medicine' AND i."medicine_id" IS NULL;--> statement-breakpoint

UPDATE "plan_enrollment_item" i
SET "medicine_id" = m."id"
FROM "medicine" m
WHERE m."name" = i."name" AND i."kind" = 'medicine' AND i."medicine_id" IS NULL;
