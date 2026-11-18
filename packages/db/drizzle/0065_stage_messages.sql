-- Stage messages: one WhatsApp template per lead/appointment moment, set on
-- the Stage Messages page. See packages/db/src/stage-messages.ts.

CREATE TABLE IF NOT EXISTS "stage_message_rule" (
  "id" text PRIMARY KEY NOT NULL,
  "trigger_key" text NOT NULL UNIQUE,
  "enabled" boolean DEFAULT false NOT NULL,
  "template_key" text,
  "delay_minutes" integer DEFAULT 0 NOT NULL,
  "respect_quiet_hours" boolean DEFAULT true NOT NULL,
  "enabled_at" timestamp,
  "last_sent_at" timestamp,
  "sent_count" integer DEFAULT 0 NOT NULL,
  "updated_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stage_message_send" (
  "id" text PRIMARY KEY NOT NULL,
  "lifecycle_event_id" text NOT NULL REFERENCES "lifecycle_event"("id") ON DELETE CASCADE,
  "rule_id" text NOT NULL REFERENCES "stage_message_rule"("id") ON DELETE CASCADE,
  "contact_id" text REFERENCES "contact"("id") ON DELETE CASCADE,
  "template_key" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "detail" text,
  "send_at" timestamp,
  "sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "stage_message_send_event_rule_unique" UNIQUE ("lifecycle_event_id", "rule_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stage_message_send_rule_created_idx" ON "stage_message_send" ("rule_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stage_message_setting" (
  "id" text PRIMARY KEY NOT NULL,
  "paused" boolean DEFAULT false NOT NULL,
  "updated_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
