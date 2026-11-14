-- 400 tokens was too tight: a model that thinks before it writes spends the
-- budget and the reply arrives truncated mid-sentence.
ALTER TABLE "ai_reply_config" ALTER COLUMN "max_output_tokens" SET DEFAULT 800;
--> statement-breakpoint
UPDATE "ai_reply_config" SET "max_output_tokens" = 800 WHERE "max_output_tokens" <= 400;
