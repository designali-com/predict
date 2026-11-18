DROP TABLE IF EXISTS "clinic_google_calendar";

CREATE TABLE IF NOT EXISTS "practitioner_google_calendar" (
  "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "refresh_token" text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
