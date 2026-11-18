-- Gender, and the reference curve, kept apart.
--
-- These are two different questions and conflating them gets one of them wrong.
-- How somebody identifies is what goes on their record and into VALD. Which
-- curve their grip is compared against is a biological question, and the
-- published norms only have two: there is no third grip curve to look up.
--
-- So "other" is a real answer for sex, and norm_reference is asked separately
-- and optionally. Somebody who does not want to pick one still gets their
-- measurement, their left/right balance and their force curve — they simply do
-- not get a muscle age, because there is no honest one to compute.

ALTER TABLE "event_lead" ADD COLUMN IF NOT EXISTS "norm_reference" text;
--> statement-breakpoint

-- Everyone recorded so far answered male or female, so their reference is that.
UPDATE "event_lead" SET "norm_reference" = "sex" WHERE "norm_reference" IS NULL AND "sex" IN ('male', 'female');
