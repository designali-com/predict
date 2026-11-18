-- Receipts: a number on every payment, and the clinic's own details to print.
--
-- Money changed hands and nothing came out of it. The desk could see a payment
-- in a list, but the patient walked away with nothing, and there was no number
-- to quote when they rang up about it three weeks later.
--
-- Two things are needed and neither can be derived at print time:
--
--   1. The receipt NUMBER has to be stored. Computing it from a row's position
--      means voiding or deleting one silently renumbers every receipt after it,
--      including ones already printed and handed over.
--
--   2. The clinic's OWN details have to come from somewhere. They are not in
--      this file: an address and a GSTIN printed on a financial document are
--      facts, and guessing them would put a wrong one on every receipt. The
--      row below carries the name and nothing else, and the receipt screen says
--      what is missing until somebody fills it in.

CREATE TABLE IF NOT EXISTS "clinic_profile" (
  "id" text PRIMARY KEY NOT NULL,
  -- What prints at the top. The rest is blank until the clinic supplies it.
  "name" text DEFAULT 'OPTM' NOT NULL,
  "legal_name" text,
  "address_line1" text,
  "address_line2" text,
  "city" text,
  "state" text,
  "pincode" text,
  "phone" text,
  "email" text,
  "website" text,
  -- Printed only when set. A blank GSTIN prints nothing rather than "GSTIN: —",
  -- because an empty tax field on a bill invites the question of whether it was
  -- forgotten.
  "gstin" text,
  "registration_no" text,
  -- Anything the clinic wants under every receipt: terms, a thank-you line.
  "footer_note" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

INSERT INTO "clinic_profile" ("id", "name")
VALUES ('default', 'OPTM')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- The number as issued. Unique because quoting one must find exactly one
-- payment; nullable only so a row can exist for the instant before it is set.
ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "receipt_no" text;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "payment_receipt_no_unique"
  ON "payment" ("receipt_no") WHERE "receipt_no" IS NOT NULL;--> statement-breakpoint

-- One counter per financial year, incremented atomically.
--
-- Deliberately NOT random. A receipt book is auditable because the numbers run
-- in order: a missing one is a question somebody has to answer. Random numbers
-- look unique and hide exactly that — nobody can tell whether a receipt was
-- destroyed. The number is still tied to the patient and the visit, through the
-- payment row it is stored on.
CREATE TABLE IF NOT EXISTS "receipt_counter" (
  -- Indian financial year, April to March: "26-27".
  "financial_year" text PRIMARY KEY NOT NULL,
  "last_number" integer DEFAULT 0 NOT NULL
);
