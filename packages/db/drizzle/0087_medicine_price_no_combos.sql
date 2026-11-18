-- Medicines carry their own counter price, and the combos are gone.
--
-- The price is the clinic's new sheet (In Station / Out Station, October 2026):
-- a medicine on its own sells at the sheet's full rate; a longer package bills
-- its own lower rate on its own line, which is unchanged here.
--
-- The two combos — "(2 BHT + LL + NPF-1) Combo" and "(2-JP + LL + NPF-1)
-- Combo" — are no longer how anything is sold: the new packages list BHT / JP,
-- NPF-1 and the rest line by line. They are switched off (not deleted: past
-- sales and enrolments still name them) and taken out of every plan template.
-- A patient's enrolment keeps its own copy of its lines and is not touched.

ALTER TABLE "medicine" ADD COLUMN IF NOT EXISTS "rate_in_paise" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE "medicine" SET "rate_in_paise" = CASE "name"
    WHEN 'BHT' THEN 180000
    WHEN 'JP' THEN 180000
    WHEN 'Phyto Proflex' THEN 162000
    WHEN 'NPF-1' THEN 99000
    WHEN 'Morn Blossom Sachet' THEN 9900
    WHEN 'Phyto Crystal' THEN 99000
    ELSE "rate_in_paise"
  END,
  "updated_at" = now()
WHERE "name" IN ('BHT', 'JP', 'Phyto Proflex', 'NPF-1', 'Morn Blossom Sachet', 'Phyto Crystal');
--> statement-breakpoint
DELETE FROM "treatment_plan_item"
WHERE "medicine_id" IN (SELECT "id" FROM "medicine" WHERE "is_kit");
--> statement-breakpoint
-- A course plan's price is the sum of its lines; a per-session plan's price is
-- one session, which a combo at ₹0 never changed.
UPDATE "treatment_plan" p SET
  "price_in_paise" = coalesce((SELECT sum(i."rate_in_paise" * i."quantity") FROM "treatment_plan_item" i WHERE i."plan_id" = p."id"), 0),
  "updated_at" = now()
WHERE NOT p."is_per_session";
--> statement-breakpoint
UPDATE "medicine" SET "is_active" = false, "updated_at" = now() WHERE "is_kit";
