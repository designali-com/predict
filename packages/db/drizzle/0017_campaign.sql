-- A one-off broadcast: a template, a list of numbers, and what happened to each.
--
-- The existing broadcast sends to contacts already in the CRM and keeps no
-- record of the run, so "did all 900 go out, and how many landed" had no
-- answer once the browser tab was closed. A campaign is that record.
--
-- One row per uploaded number, not per message sent. A number that is
-- malformed, duplicated, or refused by consent never produces a message at
-- all, and those are exactly the rows someone needs to see afterwards — a
-- report built only from messages would quietly report a smaller total than
-- the file contained.

CREATE TABLE IF NOT EXISTS "campaign" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "template_id" text NOT NULL,
  -- draft | sending | paused | completed
  "status" text DEFAULT 'draft' NOT NULL,
  -- Variable bindings, the same shape the broadcast dialog already uses.
  "variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "campaign"
  ADD CONSTRAINT "campaign_template_id_communication_template_id_fk"
  FOREIGN KEY ("template_id") REFERENCES "public"."communication_template"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "campaign"
  ADD CONSTRAINT "campaign_created_by_user_id_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "campaign_recipient" (
  "id" text PRIMARY KEY NOT NULL,
  "campaign_id" text NOT NULL,
  -- Normalised at upload so the unique index below is a plain lookup.
  "phone" text NOT NULL,
  "name" text,
  "contact_id" text,
  -- pending | sent | failed | skipped
  -- Delivery beyond "sent" is tracked on the message row, which is what the
  -- status webhook updates; duplicating it here would give two answers.
  "status" text DEFAULT 'pending' NOT NULL,
  "message_id" text,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "campaign_recipient"
  ADD CONSTRAINT "campaign_recipient_campaign_id_campaign_id_fk"
  FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "campaign_recipient"
  ADD CONSTRAINT "campaign_recipient_contact_id_contact_id_fk"
  FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "campaign_recipient"
  ADD CONSTRAINT "campaign_recipient_message_id_communication_message_id_fk"
  FOREIGN KEY ("message_id") REFERENCES "public"."communication_message"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- The same number twice in one spreadsheet is one recipient, not two messages.
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_recipient_campaign_phone_unique"
  ON "campaign_recipient" ("campaign_id", "phone");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "campaign_recipient_campaign_status_idx"
  ON "campaign_recipient" ("campaign_id", "status");
