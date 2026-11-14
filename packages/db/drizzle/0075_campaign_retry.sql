-- One automatic second attempt for a campaign's failures. A scheduled campaign
-- that finishes is looked at again 30 minutes later: every recipient whose send
-- failed, or whose message Meta later reported undelivered, is sent once more.
-- attempts stops it at two; retried_at stops the campaign at one retry pass.
-- See apps/automation/src/campaign-send.ts.

ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "retried_at" timestamp;
--> statement-breakpoint
ALTER TABLE "campaign_recipient" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 1 NOT NULL;
