CREATE TABLE IF NOT EXISTS "stage_message_doctor_template" (
  "id" text PRIMARY KEY,
  "trigger_key" text NOT NULL,
  "doctor_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "template_key" text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("trigger_key", "doctor_user_id")
);
