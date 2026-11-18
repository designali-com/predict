-- Campaign recipients are not leads.
--
-- Until now a broadcast created every unknown number as stage LEAD, so each
-- campaign inflated the lead list and funnel with people who never enquired.
-- New sends create AUDIENCE (see ContactStage.AUDIENCE). This moves the ones
-- already created that way, and only those that never did anything a lead
-- does: no reply, no form, no appointment, no account, no call status set.
--
-- Reversible: they keep source = 'CAMPAIGN'.
--   UPDATE contact SET stage = 'LEAD', lead_status = 'NEW'
--   WHERE stage = 'AUDIENCE' AND source = 'CAMPAIGN';
UPDATE "contact" c
SET "stage" = 'AUDIENCE', "lead_status" = NULL, "updated_at" = now()
WHERE c."source" = 'CAMPAIGN'
  AND c."stage" = 'LEAD'
  AND c."user_id" IS NULL
  AND c."assigned_user_id" IS NULL
  AND coalesce(c."lead_status", 'NEW') = 'NEW'
  AND NOT EXISTS (SELECT 1 FROM "communication_message" m WHERE m."contact_id" = c."id" AND m."direction" = 'inbound')
  AND NOT EXISTS (SELECT 1 FROM "appointment" a WHERE a."contact_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "lead_submission" s WHERE s."contact_id" = c."id");
