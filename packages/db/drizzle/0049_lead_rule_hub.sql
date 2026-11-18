-- Clinic location on an assignment rule, for nearest-clinic routing.
--
-- Ads target the area around each clinic, but leads still arrive from
-- elsewhere. A lead no keyword rule claims goes to the rule whose clinic is
-- closest to where the lead is (see packages/db/src/india-geo.ts).
ALTER TABLE "lead_rule" ADD COLUMN IF NOT EXISTS "hub_label" text;
--> statement-breakpoint
ALTER TABLE "lead_rule" ADD COLUMN IF NOT EXISTS "hub_lat" double precision;
--> statement-breakpoint
ALTER TABLE "lead_rule" ADD COLUMN IF NOT EXISTS "hub_lng" double precision;
