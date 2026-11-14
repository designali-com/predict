-- Phone OTP sign-in: WhatsApp first, SMS as the fallback.
--
-- The two columns are what better-auth's phone-number plugin reads and
-- writes. phone_number is stored in the same shape as contact.phone —
-- country code and digits, no "+" (919876543210) — because that is the one
-- form every other phone in this database already uses, and two formats for
-- the same human is how duplicates start.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone_number" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "phone_number_verified" boolean DEFAULT false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_phone_number_unique" ON "user" ("phone_number");
--> statement-breakpoint

-- Every patient who already has a login gets the number off their chart's
-- contact, so they can sign in by OTP without anybody re-entering it.
-- DISTINCT ON keeps it to one account per number: the index is unique, and
-- one number on two charts is a data problem to fix by hand, not to resolve
-- by picking one silently — those are left null and show up in the check
-- below.
WITH candidates AS (
  SELECT DISTINCT ON (c.phone) u.id AS user_id, c.phone
  FROM "user" u
  JOIN patient_record pr ON pr.user_id = u.id
  JOIN contact c ON c.id = pr.contact_id
  WHERE u.phone_number IS NULL
    AND c.phone ~ '^[0-9]{10,15}$'
  ORDER BY c.phone, u.created_at
)
UPDATE "user" u
SET phone_number = candidates.phone
FROM candidates
WHERE u.id = candidates.user_id
  AND NOT EXISTS (SELECT 1 FROM "user" taken WHERE taken.phone_number = candidates.phone);
--> statement-breakpoint

-- One row per OTP send attempt, whatever happened to it.
--
-- This is what enforces "three on WhatsApp, then SMS": the attempt counts,
-- the cooldown and the SMS unlock are all read from here, on the server,
-- because a rule enforced only in the browser is a suggestion. It is also
-- the SMS bill — each sms row is a message somebody paid for.
CREATE TABLE IF NOT EXISTS "otp_delivery" (
  "id" text PRIMARY KEY NOT NULL,
  "phone" text NOT NULL,
  "channel" text NOT NULL,              -- whatsapp | sms
  "status" text NOT NULL,               -- sent | failed | withheld
  "provider_message_id" text,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "otp_delivery_phone_created_idx" ON "otp_delivery" ("phone", "created_at");
