-- When a campaign goes out. Set means the automation worker sends it — at that
-- time, from the server — instead of a browser tab that has to stay open for
-- the length of a 19,000-message send. Null is the old in-browser send.
-- See apps/automation/src/campaign-send.ts.

ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_due_idx" ON "campaign" ("status", "scheduled_at");
