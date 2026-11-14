-- Risk bands stay on the index↔domain link, and become flexible there too.
--
-- 0019 moved them onto biomarker_domain on the reasoning that nothing yet
-- makes a domain's scale differ between categories. That reasoning was about
-- the code as it stands, not about the clinic's intent: a domain's thresholds
-- are meant to be set per category, and the weight that will justify it is
-- simply not built yet. So the link keeps them.
--
-- What does carry over from 0018 is the shape. Three fixed columns fixed both
-- the number of bands and their names; this is the same ordered jsonb list,
-- with the last band open-ended. See ./risk-bands.ts.
--
-- The domain column added by 0019 goes: two places to configure the same
-- thing is how they end up disagreeing. Neither ever held a value.

ALTER TABLE "biomarker_domain" DROP COLUMN IF EXISTS "risk_bands";--> statement-breakpoint

ALTER TABLE "index_domain_map"
  ADD COLUMN IF NOT EXISTS "risk_bands" jsonb DEFAULT '[]'::jsonb NOT NULL;
