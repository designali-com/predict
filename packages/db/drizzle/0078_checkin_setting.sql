-- The daily check-ins' switches: on/off and the time each goes out (IST),
-- one row per kind (medicine | exercise | diet). No row means on, at 9:00.
-- Set from Operations → Automations → Daily check-ins.

CREATE TABLE IF NOT EXISTS "checkin_setting" (
  "kind" text PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "send_hour" integer DEFAULT 9 NOT NULL,
  "send_minute" integer DEFAULT 0 NOT NULL,
  "updated_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
