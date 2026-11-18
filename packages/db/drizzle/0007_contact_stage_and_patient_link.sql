-- Follow-up to 0006. Three problems the audit surfaced, all of which were
-- actively producing bad data:
--
--   1. contact.status carried two unrelated axes. A flow writing LONG_TERM
--      erased the fact that the person was still a LEAD, so every
--      `stage == "LEAD"` condition downstream stopped matching them.
--   2. patient_record could only reach contact through `user`, so a walk-in
--      with no login had no link at all, and deleting a user orphaned the
--      chart permanently.
--   3. contact.phone was written in two shapes ("9876543210" and
--      "919876543210"), so the unique index could not dedupe and inbound
--      WhatsApp could not match the contact.
--
-- Hand-authored: drizzle-kit cannot tell a rename from a drop+create.
-- Not touched: rsvp_responses (different project, same database).

-- 1. Lifecycle position and nurture outcome become separate columns.
ALTER TABLE "contact" RENAME COLUMN "status" TO "stage";--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "engagement" text;--> statement-breakpoint

-- Values that were never a stage move to the axis they belong on. These
-- contacts are leads that finished a nurture sequence, so that is what they
-- go back to being.
UPDATE "contact"
   SET "engagement" = "stage", "stage" = 'LEAD'
 WHERE "stage" NOT IN ('LEAD', 'PATIENT', 'INACTIVE', 'LOST');--> statement-breakpoint

-- 2. The chart hangs off the person, not only off the login.
ALTER TABLE "patient_record" ADD COLUMN IF NOT EXISTS "contact_id" text;--> statement-breakpoint

UPDATE "patient_record" pr
   SET "contact_id" = c."id"
  FROM "contact" c
 WHERE c."user_id" = pr."user_id"
   AND pr."user_id" IS NOT NULL
   AND pr."contact_id" IS NULL;--> statement-breakpoint

ALTER TABLE "patient_record"
  ADD CONSTRAINT "patient_record_contact_id_unique" UNIQUE ("contact_id");--> statement-breakpoint

ALTER TABLE "patient_record"
  ADD CONSTRAINT "patient_record_contact_id_contact_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 3. One stored phone shape. Bare 10-digit numbers get the country code;
--    a leading trunk 0 is dropped first. Anything already 11-15 digits is
--    left alone, and anything that is not a plain number is left for a
--    human rather than mangled.
UPDATE "contact"
   SET "phone" = '91' || regexp_replace("phone", '\D', '', 'g')
 WHERE "phone" IS NOT NULL
   AND length(regexp_replace("phone", '\D', '', 'g')) = 10;--> statement-breakpoint

UPDATE "contact"
   SET "phone" = '91' || substring(regexp_replace("phone", '\D', '', 'g') from 2)
 WHERE "phone" IS NOT NULL
   AND length(regexp_replace("phone", '\D', '', 'g')) = 11
   AND regexp_replace("phone", '\D', '', 'g') LIKE '0%';
