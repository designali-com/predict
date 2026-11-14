-- Which WhatsApp number belongs to which clinic.
--
-- One number today, both clinics on it. When Kolkata gets its own number,
-- that is a row here — not a code change: an inbound message is matched to a
-- clinic by the number it arrived on, and a reply goes out from the number
-- belonging to that person's clinic.
--
-- The token is NOT stored. Provider secrets stay in the environment, as they
-- do everywhere else in this schema; the row names the env var that holds it
-- (WHATSAPP_ACCESS_TOKEN_KOLKATA, say), so adding a number is a row plus a
-- deploy variable, and the database never becomes a place secrets leak from.
CREATE TABLE IF NOT EXISTS "clinic_channel" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinic"("id") ON DELETE CASCADE,
  "channel" text NOT NULL DEFAULT 'whatsapp',
  -- Meta's id for the sending number. The inbound webhook carries it, which
  -- is what lets a message find its clinic.
  "phone_number_id" text NOT NULL,
  "waba_id" text,
  -- As a human reads it, for the settings screen.
  "display_number" text,
  -- Name of the env var holding this number's access token. Empty = use the
  -- default WHATSAPP_ACCESS_TOKEN.
  "token_env_var" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_channel_number_unique" ON "clinic_channel" ("phone_number_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clinic_channel_clinic_idx" ON "clinic_channel" ("clinic_id", "channel");
--> statement-breakpoint

-- Which number a message actually went out on (or came in on). Without it,
-- "why did this patient get a message from the other clinic's number?" has no
-- answer once there is more than one.
ALTER TABLE "communication_message" ADD COLUMN IF NOT EXISTS "clinic_channel_id" text REFERENCES "clinic_channel"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- A template is approved per WABA. With one WABA this changes nothing; with
-- two, the same template key can be approved in one and still pending in the
-- other, and sending must know the difference rather than failing at Meta.
CREATE TABLE IF NOT EXISTS "template_channel" (
  "id" text PRIMARY KEY NOT NULL,
  "template_id" text NOT NULL REFERENCES "communication_template"("id") ON DELETE CASCADE,
  "clinic_channel_id" text NOT NULL REFERENCES "clinic_channel"("id") ON DELETE CASCADE,
  "provider_template_name" text,
  "waba_template_id" text,
  "submission_status" text NOT NULL DEFAULT 'draft',
  "rejection_reason" text,
  "quality_rating" text,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "template_channel_unique" ON "template_channel" ("template_id", "clinic_channel_id");
