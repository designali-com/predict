-- The house rules automation runs under, and the bookkeeping the sweeps need.
--
-- Everything here exists because of something that goes wrong without it:
-- messages at 2am (quiet hours), a lead nobody calls (first response),
-- "call me tomorrow at 5" that nobody is reminded of (callback), and a
-- worker that dies silently while leads pile up (heartbeat).
CREATE TABLE IF NOT EXISTS "automation_settings" (
  "id" text PRIMARY KEY NOT NULL,
  -- Outside these hours a marketing/reminder message waits for morning
  -- instead of going out. Local clock, in the timezone below.
  "quiet_hours_enabled" boolean NOT NULL DEFAULT true,
  "quiet_start_hour" integer NOT NULL DEFAULT 21,
  "quiet_end_hour" integer NOT NULL DEFAULT 9,
  "timezone" text NOT NULL DEFAULT 'Asia/Kolkata',
  -- A new lead nobody has worked within this many minutes is escalated.
  -- 0 switches the check off.
  "first_response_minutes" integer NOT NULL DEFAULT 15,
  "callback_reminders" boolean NOT NULL DEFAULT true,
  -- Email the person a lead was routed to, as soon as it lands.
  "notify_assignee" boolean NOT NULL DEFAULT true,
  -- Where escalations go when the lead has no owner yet.
  "manager_email" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "automation_settings" ("id") SELECT gen_random_uuid()::text
WHERE NOT EXISTS (SELECT 1 FROM "automation_settings");
--> statement-breakpoint
-- Markers, so a sweep that runs every minute acts exactly once per lead.
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "callback_reminded_at" timestamp;
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "first_response_escalated_at" timestamp;
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "assignment_notified_at" timestamp;
--> statement-breakpoint
-- "Is anything actually running?" — the worker and webhook stamp their name
-- here every tick, and the console says how long ago that was. Without it a
-- dead worker looks exactly like a quiet day.
CREATE TABLE IF NOT EXISTS "system_heartbeat" (
  "name" text PRIMARY KEY NOT NULL,
  "last_seen_at" timestamp NOT NULL DEFAULT now(),
  "detail" text
);
