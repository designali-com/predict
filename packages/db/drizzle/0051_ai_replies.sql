-- The AI that answers a reply nothing else handles.
--
-- A template goes out, the person writes back something no flow branch and no
-- keyword expects, and until now that message just sat in the inbox until
-- somebody opened it. This is the fallback: one row of settings (there is
-- only ever one), the clinic's own information to answer from, and the limits
-- that stop it talking to somebody forever.
CREATE TABLE IF NOT EXISTS "ai_reply_config" (
  "id" text PRIMARY KEY NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  -- openai | google — see packages/db/src/ai-providers.ts. Keys stay in env.
  "provider" text NOT NULL DEFAULT 'openai',
  "model" text NOT NULL DEFAULT 'gpt-4o-mini',
  "temperature" double precision NOT NULL DEFAULT 0.3,
  "max_output_tokens" integer NOT NULL DEFAULT 400,
  -- What the clinic actually does, charges and when it opens: the only facts
  -- the model may state. Anything not in here it must not invent.
  "business_info" text NOT NULL DEFAULT '',
  -- Tone and house rules, added to the hard-coded safety prompt.
  "instructions" text NOT NULL DEFAULT '',
  -- Stop replying to the same person after this many AI messages in a day.
  "daily_limit_per_contact" integer NOT NULL DEFAULT 6,
  -- If a human sent this contact anything in the last N minutes, stay out of
  -- the way — a caller mid-conversation must not be talked over.
  "human_takeover_minutes" integer NOT NULL DEFAULT 30,
  -- Hand over instead of answering when the person asks for these (comma list).
  "handoff_keywords" text NOT NULL DEFAULT '',
  -- Raise a task for the lead's owner on handoff.
  "handoff_creates_task" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "ai_reply_config" ("id") SELECT gen_random_uuid()::text
WHERE NOT EXISTS (SELECT 1 FROM "ai_reply_config");
--> statement-breakpoint
-- Which outbound messages the AI wrote: the daily cap counts them, the inbox
-- marks them, and "what did we actually say" stays answerable.
ALTER TABLE "communication_message" ADD COLUMN IF NOT EXISTS "ai_generated" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
INSERT INTO "role_permission" ("id", "role", "permission", "created_at")
SELECT gen_random_uuid()::text, rp."role", 'ops.ai_replies', now()
FROM "role_permission" rp
WHERE rp."permission" = 'ops.flows'
  AND NOT EXISTS (SELECT 1 FROM "role_permission" x WHERE x."role" = rp."role" AND x."permission" = 'ops.ai_replies');
