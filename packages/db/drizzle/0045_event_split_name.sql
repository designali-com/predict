-- First and last name, taken separately.
--
-- The kiosk asked for one "full name" box and split it on whitespace to reach
-- the two fields VALD requires. That guessed: somebody who typed one word got a
-- made-up surname, and anybody with a two-word first name got it cut in half.
-- The clinic has always asked for the two parts separately, and the profiles it
-- creates are the ones the operator recognises, so the kiosk now does the same.

ALTER TABLE "event_lead" ADD COLUMN IF NOT EXISTS "first_name" text;
--> statement-breakpoint
ALTER TABLE "event_lead" ADD COLUMN IF NOT EXISTS "last_name" text;
--> statement-breakpoint

-- Backfill from the single field, using the same split it used to do, so the
-- rows already collected keep working.
UPDATE "event_lead"
SET "first_name" = COALESCE(NULLIF(split_part(trim("name"), ' ', 1), ''), trim("name")),
    "last_name" = NULLIF(trim(substring(trim("name") from position(' ' in trim("name")) + 1)), '')
WHERE "first_name" IS NULL;
--> statement-breakpoint

-- A row with no surname at all keeps the placeholder it was given, rather than
-- being left null and failing VALD's validation on the next push.
UPDATE "event_lead" SET "last_name" = 'PREDICT' WHERE "last_name" IS NULL OR "last_name" = "first_name";
--> statement-breakpoint

ALTER TABLE "event_lead" ALTER COLUMN "first_name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "event_lead" ALTER COLUMN "last_name" SET NOT NULL;
