-- A combo is packaging, not a thing on a shelf.
--
-- 0032 made "(2 BHT + LL + NPF-1) Combo" a stock item, which is wrong: the
-- storeroom buys, stores and runs out of BHT, LL and NPF-1 separately, and one
-- combo draws on three different tins. The patient is still sold and handed a
-- combo — that is what the treatment plan line says — but stock is counted per
-- medicine.
--
-- So the two combos become KITS: no stock of their own, expanded to components
-- whenever something is consumed or forecast.

ALTER TABLE "medicine" ADD COLUMN IF NOT EXISTS "is_kit" boolean DEFAULT false NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "medicine_component" (
  "id" text PRIMARY KEY NOT NULL,
  "kit_id" text NOT NULL,
  "component_id" text NOT NULL,
  "quantity" double precision DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "medicine_component"
  ADD CONSTRAINT "medicine_component_kit_id_medicine_id_fk"
  FOREIGN KEY ("kit_id") REFERENCES "public"."medicine"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- RESTRICT: deleting a medicine that a combo is made of would quietly change
-- what that combo contains.
ALTER TABLE "medicine_component"
  ADD CONSTRAINT "medicine_component_component_id_medicine_id_fk"
  FOREIGN KEY ("component_id") REFERENCES "public"."medicine"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "medicine_component_unique"
  ON "medicine_component" ("kit_id", "component_id");--> statement-breakpoint

-- The four medicines the two combos are actually made of.
--
-- Named exactly as they appear on the clinic's package sheet. Nothing here
-- expands the abbreviations, because guessing what BHT or NPF-1 stands for and
-- printing it on a storeroom label would be worse than the abbreviation the
-- clinic already uses. Rename them on the stock page.
INSERT INTO "medicine" ("id", "name", "unit", "reorder_level", "is_kit")
SELECT gen_random_uuid()::text, m."name", 'piece', 0, false
FROM (VALUES ('BHT'), ('JP'), ('LL'), ('NPF-1')) AS m("name")
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint

-- The two combos stop being stock and become compositions.
UPDATE "medicine" SET "is_kit" = true
WHERE "name" IN ('(2 BHT + LL + NPF-1) Combo', '(2-JP + LL + NPF-1) Combo');--> statement-breakpoint

-- Two limbs: 2 × BHT, 1 × LL, 1 × NPF-1.
INSERT INTO "medicine_component" ("id", "kit_id", "component_id", "quantity")
SELECT gen_random_uuid()::text, k."id", c."id", v."qty"
FROM "medicine" k
JOIN (VALUES ('BHT', 2::double precision), ('LL', 1), ('NPF-1', 1)) AS v("name", "qty") ON true
JOIN "medicine" c ON c."name" = v."name"
WHERE k."name" = '(2 BHT + LL + NPF-1) Combo'
ON CONFLICT ("kit_id", "component_id") DO NOTHING;--> statement-breakpoint

-- Four limbs: 2 × JP, 1 × LL, 1 × NPF-1.
INSERT INTO "medicine_component" ("id", "kit_id", "component_id", "quantity")
SELECT gen_random_uuid()::text, k."id", c."id", v."qty"
FROM "medicine" k
JOIN (VALUES ('JP', 2::double precision), ('LL', 1), ('NPF-1', 1)) AS v("name", "qty") ON true
JOIN "medicine" c ON c."name" = v."name"
WHERE k."name" = '(2-JP + LL + NPF-1) Combo'
ON CONFLICT ("kit_id", "component_id") DO NOTHING;--> statement-breakpoint

-- A kit cannot hold stock, so any movement recorded against one in the short
-- window since 0032 would be counting something that does not exist. There
-- should be none; this is belt and braces before the rule starts being relied
-- on, and it names what it removed.
DELETE FROM "stock_movement" sm
USING "medicine" m
WHERE m."id" = sm."medicine_id" AND m."is_kit" = true;
