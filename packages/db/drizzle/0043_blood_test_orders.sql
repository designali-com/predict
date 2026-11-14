-- Blood tests as something the clinic sells, not just something that arrives.
--
-- Until now a blood report could only be uploaded after the fact, and the money
-- for it was invisible: biomarkers carried a price nobody could charge. This
-- makes the order the thing — chosen marker by marker, priced, billed, and then
-- joined to the report and the readings it produces, so a value in the chart can
-- always be traced to the test that produced it and the day the blood was drawn.

CREATE TABLE IF NOT EXISTS "blood_test_order" (
  "id" text PRIMARY KEY NOT NULL,
  "patient_id" text NOT NULL REFERENCES "patient_record"("id") ON DELETE CASCADE,
  -- Money hangs off the contact everywhere else in this product, so it does
  -- here too. Kept on the order rather than looked up each time: a chart that
  -- is later re-pointed must not move a bill that was already paid.
  "contact_id" text REFERENCES "contact"("id") ON DELETE SET NULL,
  -- ordered | collected | reported | cancelled
  "status" text NOT NULL DEFAULT 'ordered',
  "ordered_on" date NOT NULL,
  -- The day blood was actually drawn, which is not the day it was ordered and
  -- not the day the PDF arrived.
  "collected_on" date,
  -- The sum of the items, frozen. Recomputing from today's catalogue would
  -- change a bill the patient is already holding.
  "total_in_paise" integer NOT NULL DEFAULT 0,
  "note" text,
  "ordered_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "cancelled_at" timestamp,
  "cancel_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "blood_test_order_patient_id_idx"
  ON "blood_test_order" ("patient_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "blood_test_order_item" (
  "id" text PRIMARY KEY NOT NULL,
  "order_id" text NOT NULL REFERENCES "blood_test_order"("id") ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: deleting a biomarker from the catalogue must not
  -- quietly remove a line from a bill somebody was charged for.
  "biomarker_id" text NOT NULL REFERENCES "biomarker"("id") ON DELETE RESTRICT,
  -- The price as it stood when the test was ordered. Copied rather than joined
  -- for the same reason receipts store their own numbers: editing the catalogue
  -- tomorrow must not rewrite what a patient paid today.
  "price_in_paise" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "blood_test_order_item_unique" UNIQUE ("order_id", "biomarker_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "blood_test_order_item_order_id_idx"
  ON "blood_test_order_item" ("order_id");
--> statement-breakpoint

-- The money. A third target alongside appointment and enrollment, so a blood
-- test appears in Billing next to everything else the desk collects.
ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "blood_test_order_id" text
  REFERENCES "blood_test_order"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- Which test produced this value. Without it, two panels drawn a week apart are
-- just two piles of numbers with no way back to the report they came from.
ALTER TABLE "biomarker_reading" ADD COLUMN IF NOT EXISTS "blood_test_order_id" text
  REFERENCES "blood_test_order"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- The lab's own PDF, attached to the order it fulfils. On the report rather
-- than on the order because a lab can send more than one sheet for one draw.
ALTER TABLE "report" ADD COLUMN IF NOT EXISTS "blood_test_order_id" text
  REFERENCES "blood_test_order"("id") ON DELETE SET NULL;
