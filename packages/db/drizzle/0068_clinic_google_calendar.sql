CREATE TABLE IF NOT EXISTS "clinic_google_calendar" (
  "clinic_id" text PRIMARY KEY REFERENCES "clinic"("id") ON DELETE CASCADE,
  "refresh_token" text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
