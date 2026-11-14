-- Consent and a signature at the foot of every clinical form.
--
-- The paper forms end with the patient signing. Nothing on screen did, so a
-- submitted form recorded what was asked and not that anybody agreed to it —
-- and a consent that exists only because somebody remembers taking it is not a
-- consent anyone can produce later.
--
-- Stored on the submission itself, not in a table of its own. A signature
-- belongs to one filling-in of one form: the same patient signs FORM-I at the
-- counter and FORM-III an hour later, and those are two separate acts.

ALTER TABLE "clinical_form_submission"
  -- The wording that was on screen when they signed. Copied in rather than
  -- referenced, because the clinic can change its consent text and every
  -- signature already taken was given against the words shown at the time.
  ADD COLUMN IF NOT EXISTS "consent_text" text,
  ADD COLUMN IF NOT EXISTS "consent_given" boolean DEFAULT false NOT NULL,
  -- A PNG data URL from the signature pad. Kept in the row rather than in file
  -- storage: it is a few kilobytes, it is meaningless apart from this
  -- submission, and a file that can go missing separately from the record it
  -- belongs to is worse than a column.
  ADD COLUMN IF NOT EXISTS "signature_data_url" text,
  -- Who signed. Not always the patient — a parent, a guardian, an attendant.
  ADD COLUMN IF NOT EXISTS "signed_name" text,
  ADD COLUMN IF NOT EXISTS "signed_at" timestamp;--> statement-breakpoint

-- The clinic's own consent wording, printed above the signature pad.
--
-- In the database, alongside the address and the receipt footer, for the same
-- reason: what a clinic asks a patient to agree to is that clinic's words. The
-- default below is deliberately plain and is meant to be replaced.
ALTER TABLE "clinic_profile"
  ADD COLUMN IF NOT EXISTS "consent_text" text;--> statement-breakpoint

UPDATE "clinic_profile"
SET "consent_text" =
  'I confirm that the information I have given is true and complete to the best of my knowledge, and I consent to the examination, assessment and treatment discussed with me.'
WHERE "consent_text" IS NULL;
