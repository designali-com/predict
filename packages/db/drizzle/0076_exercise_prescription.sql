-- Exercise prescriptions: a library the doctor copies from (the patient's own
-- prescription lives in clinical_form_submission, form key exercise_protocol),
-- and a daily log of whether the patient did them, answered from a WhatsApp
-- check-in. See packages/db/src/exercise-protocol*.ts and exercise-log.ts.

CREATE TABLE IF NOT EXISTS "exercise_protocol_template" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "protocol" jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "updated_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_protocol_template_active_idx" ON "exercise_protocol_template" ("is_active", "name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercise_log" (
  "id" text PRIMARY KEY NOT NULL,
  "contact_id" text NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "for_date" date NOT NULL,
  "response" text NOT NULL,
  "source" text DEFAULT 'whatsapp' NOT NULL,
  "message_id" text,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercise_log_contact_day_unique" ON "exercise_log" ("contact_id", "for_date");
