-- Domain risk bands move off the mapping and onto the domain.
--
-- index_domain_map carried risk_normal_max / risk_moderate_max /
-- risk_severe_max: one domain's thresholds *within one category*. Two things
-- were wrong with that.
--
-- The shape: three fixed columns fix both the number of bands and their names,
-- which is the same problem 0018 fixed on biomarker_index.
--
-- The place: index_domain_map answers "which domains belong to which
-- category". That is wiring. Thresholds are configuration, and putting them on
-- the wiring made a screen about relationships carry numbers about scales.
--
-- Per-link would be justified if a domain's score meant something different
-- inside each category — which would follow from a per-link weight (W_d in
-- ΔAge = Σ(k * α_d * Mean|Z|_d * W_d)). No such column exists yet. Until it
-- does, one set of bands per domain is the truth, and the simpler one. If
-- weights arrive, moving these back is a migration with a real reason behind
-- it rather than an assumption.
--
-- Nothing is lost: every one of the twelve links has all three columns null.

ALTER TABLE "biomarker_domain"
  ADD COLUMN IF NOT EXISTS "risk_bands" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

ALTER TABLE "index_domain_map" DROP COLUMN IF EXISTS "risk_normal_max";--> statement-breakpoint
ALTER TABLE "index_domain_map" DROP COLUMN IF EXISTS "risk_moderate_max";--> statement-breakpoint
ALTER TABLE "index_domain_map" DROP COLUMN IF EXISTS "risk_severe_max";
