-- Every lead form someone filled in, whether on a Meta ad, a Google ad or our
-- own website — the raw submission, kept alongside the contact it produced.
--
-- The contact row holds only who the person is and their first-touch
-- attribution. That is not enough to work a lead: the caller needs the answers
-- they gave ("which problem?", "which city?") and marketing needs the exact
-- form, campaign, ad set and ad. A person who fills in two forms is one contact
-- with two submissions, not two contacts.
--
-- (provider, external_id) is the provider's own id for the submission — Meta's
-- leadgen_id, Google's lead_id — so a webhook that is delivered twice, or a
-- backfill that re-reads leads already received, is a no-op instead of a
-- second WhatsApp to the same person.

CREATE TABLE IF NOT EXISTS "lead_submission" (
  "id" text PRIMARY KEY NOT NULL,
  "contact_id" text REFERENCES "contact"("id") ON DELETE CASCADE,
  -- meta | google | website
  "provider" text NOT NULL,
  "external_id" text NOT NULL,
  "form_id" text,
  "form_name" text,
  "campaign_id" text,
  "campaign_name" text,
  "adset_id" text,
  "adset_name" text,
  "ad_id" text,
  "ad_name" text,
  -- FACEBOOK | INSTAGRAM | GOOGLE | WEBSITE ...
  "platform" text,
  "page_id" text,
  -- The form's answers as label -> value, including custom questions.
  "answers" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Exactly what the provider sent, so nothing is lost to a mapping we got wrong.
  "raw" jsonb,
  "is_test" boolean NOT NULL DEFAULT false,
  "is_organic" boolean NOT NULL DEFAULT false,
  -- Set when the webhook arrived but the lead itself could not be fetched
  -- (Meta sends only an id). The row exists so the backfill can retry it.
  "fetch_error" text,
  "submitted_at" timestamp,
  "received_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_submission_provider_external_unique"
  ON "lead_submission" ("provider", "external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_submission_contact_idx"
  ON "lead_submission" ("contact_id", "received_at");
