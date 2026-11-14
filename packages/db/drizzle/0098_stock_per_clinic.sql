-- Each clinic keeps its own stock. The medicine catalogue (names, units, rates,
-- kits) stays shared; what is on the shelf is counted per clinic, from that
-- clinic's own movements. Everything so far was OPTM's.
ALTER TABLE "stock_movement" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE cascade;--> statement-breakpoint
UPDATE "stock_movement" SET "clinic_id" = '6d1528c4-0c4f-4428-a188-e1445dc426d7' WHERE "clinic_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movement_clinic_medicine_idx" ON "stock_movement" ("clinic_id", "medicine_id");
