-- The AI provider becomes a stored choice instead of a guess.
--
-- The chat route worked out which SDK to call by looking at the model name:
--
--   const isGemini = modelName.toLowerCase().startsWith("gemini")
--
-- which is a rule about spelling standing in for a rule about routing. It is
-- wrong in both directions the moment either vendor names a model outside the
-- pattern, and it gives the admin screen nothing honest to show — a provider
-- dropdown would have had to write its answer into the model string.
--
-- Backfilled from the same rule, because that is genuinely what the existing
-- row meant.

ALTER TABLE "ai_assistant_config"
  ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'openai' NOT NULL;--> statement-breakpoint

UPDATE "ai_assistant_config"
  SET "provider" = CASE WHEN lower("model") LIKE 'gemini%' THEN 'google' ELSE 'openai' END;--> statement-breakpoint

ALTER TABLE "ai_assistant_config"
  ADD CONSTRAINT "ai_assistant_config_provider_check"
  CHECK ("provider" IN ('openai', 'google'));
