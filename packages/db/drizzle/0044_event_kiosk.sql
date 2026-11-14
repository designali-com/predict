-- The event kiosk: a stranger at a stall, a grip test, and a result they can
-- come back to.
--
-- Deliberately its own table rather than a contact or a patient_record. These
-- are not patients: nobody has consented to clinical care, most will never come
-- back, and mixing a few thousand event walk-ups into the chart table would
-- corrupt every patient count in the product. A lead that turns into a real
-- patient gets converted explicitly.

CREATE TABLE IF NOT EXISTS "event_lead" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "phone" text NOT NULL,
  "email" text,
  -- Age and sex are not optional extras here: grip strength norms are entirely
  -- age- and sex-specific, so without them there is no comparison to make and
  -- no grip age to report.
  "age_years" integer NOT NULL,
  "sex" text NOT NULL,

  -- Two identifiers, doing two different jobs.
  --
  -- claim_code is short because a person reads it off a screen. It is never
  -- enough on its own — retrieval pairs it with the phone number — because six
  -- characters can be guessed in an afternoon and each guess would expose a
  -- stranger's name and result.
  "claim_code" text NOT NULL,
  -- share_token is long and random because it IS the link. Anyone holding it
  -- sees the result, which is the point: the sharing is the reach.
  "share_token" text NOT NULL,

  -- Which stall, which day. Lets one table serve several events.
  "event_name" text,

  -- VALD side.
  "vald_profile_id" text,
  "test_id" text,
  "tested_at" timestamp,

  -- The result, flattened for reading.
  "peak_left_newtons" double precision,
  "peak_right_newtons" double precision,
  "asymmetry_percent" double precision,
  -- Computed from published norms at the time of the test, and stored: the
  -- number on a link somebody shared must not change if the norm table is
  -- edited later.
  "grip_age_years" double precision,
  "percentile" double precision,

  -- The force-time curve, the thing that makes one test worth looking at.
  "force_trace" jsonb,
  "raw" jsonb,

  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "event_lead_claim_code_idx" ON "event_lead" ("claim_code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_lead_share_token_idx" ON "event_lead" ("share_token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_lead_phone_idx" ON "event_lead" ("phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_lead_created_at_idx" ON "event_lead" ("created_at");
