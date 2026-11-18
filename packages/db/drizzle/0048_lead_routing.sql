-- Lead routing: who works a lead, what it is about, and where it stands.
--
-- assigned_user_id / assigned_role: the owner. A lead assigned to a role but
--   no person sits in that role's shared pool until someone takes it.
-- lead_status: the call disposition (see packages/db/src/lead-status.ts) —
--   separate from stage, which is the lifecycle.
-- interest: what brought them in (knee_pain, back_pain ...), set from the ad
--   set / campaign / form by lead_rule. Flows pick templates by it.
-- city: read off the form, used for routing and shown to the caller.

ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "assigned_user_id" text REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "assigned_role" text;
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp;
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "lead_status" text DEFAULT 'NEW';
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "lead_status_at" timestamp;
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "callback_at" timestamp;
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "interest" text;
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "city" text;
--> statement-breakpoint
-- Existing rows: a booked contact is "Appointment booked"; anyone past the
-- lead side has no call disposition at all.
UPDATE "contact" SET "lead_status" = CASE "stage"
  WHEN 'LEAD' THEN 'NEW'
  WHEN 'BOOKED' THEN 'APPOINTMENT_BOOKED'
  ELSE NULL END;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_assigned_user_idx" ON "contact" ("assigned_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_lead_status_idx" ON "contact" ("lead_status");
--> statement-breakpoint

-- The rules, edited in Setup -> Lead routing. Evaluated by priority (lowest
-- first); the first matching rule of each kind wins.
--   kind 'assign':   who gets the lead (a role, optionally narrowed to
--                    specific people, round-robin between them)
--   kind 'interest': what the lead is about
-- match_values is a comma list of keywords, matched case-insensitively as
-- "contains" against match_field. Empty = matches every lead (a catch-all).
CREATE TABLE IF NOT EXISTS "lead_rule" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "priority" integer NOT NULL DEFAULT 100,
  "active" boolean NOT NULL DEFAULT true,
  -- any | city | adset | campaign | ad | form | answers | source
  "match_field" text NOT NULL DEFAULT 'any',
  "match_values" text NOT NULL DEFAULT '',
  "assign_role" text,
  "assign_user_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "interest" text,
  -- Round-robin position. Incremented atomically per assignment.
  "rr_cursor" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Two new permissions. Nothing changes for anyone today: every role that can
-- open Leads keeps seeing all of them. A role granted ops.leads WITHOUT
-- ops.leads_all (a telecaller) sees only leads assigned to them or their role.
INSERT INTO "role_permission" ("id", "role", "permission", "created_at")
SELECT gen_random_uuid()::text, rp."role", 'ops.leads_all', now()
FROM "role_permission" rp
WHERE rp."permission" = 'ops.leads'
  AND NOT EXISTS (SELECT 1 FROM "role_permission" x WHERE x."role" = rp."role" AND x."permission" = 'ops.leads_all');
--> statement-breakpoint
INSERT INTO "role_permission" ("id", "role", "permission", "created_at")
SELECT gen_random_uuid()::text, rp."role", 'ops.lead_routing', now()
FROM "role_permission" rp
WHERE rp."permission" = 'ops.flows'
  AND NOT EXISTS (SELECT 1 FROM "role_permission" x WHERE x."role" = rp."role" AND x."permission" = 'ops.lead_routing');
