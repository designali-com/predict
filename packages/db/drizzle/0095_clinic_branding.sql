-- Each clinic is its own brand. OPTM, Apollo or any hospital runs the clinic
-- panel under its own name and logo, prints its own receipts and numbers them
-- itself; Predict is the diagnosis side (blood, muscle age, biological age,
-- wearables) the clinics refer to, not a clinic.
--
-- What used to be the single clinic_profile row (the letterhead on receipts
-- and forms) moves onto the clinic it belongs to — OPTM's.
ALTER TABLE "clinic" ADD COLUMN IF NOT EXISTS "short_name" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN IF NOT EXISTS "legal_name" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN IF NOT EXISTS "website" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN IF NOT EXISTS "logo_url" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN IF NOT EXISTS "logo_dark_url" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN IF NOT EXISTS "icon_url" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN IF NOT EXISTS "brand_color" text;--> statement-breakpoint
ALTER TABLE "clinic" ADD COLUMN IF NOT EXISTS "receipt_prefix" text NOT NULL DEFAULT 'RCPT';--> statement-breakpoint
-- What the clinic uses of the panel. Everything to begin with; see clinic-modules.ts.
ALTER TABLE "clinic" ADD COLUMN IF NOT EXISTS "modules" text[] NOT NULL DEFAULT '{appointments,therapy,medicine,billing,diagnosis}';--> statement-breakpoint

-- OPTM's letterhead, from the old single profile, where the clinic has none.
UPDATE "clinic" c SET
  "short_name" = coalesce(c."short_name", 'OPTM'),
  "receipt_prefix" = 'OPTM',
  "legal_name" = coalesce(c."legal_name", p."legal_name"),
  "website" = coalesce(c."website", p."website"),
  "address_line1" = coalesce(nullif(c."address_line1", ''), p."address_line1"),
  "address_line2" = coalesce(nullif(c."address_line2", ''), p."address_line2"),
  "state" = coalesce(nullif(c."state", ''), p."state"),
  "pincode" = coalesce(nullif(c."pincode", ''), p."pincode"),
  "phone" = coalesce(nullif(c."phone", ''), p."phone"),
  "email" = coalesce(nullif(c."email", ''), p."email"),
  "gstin" = coalesce(nullif(c."gstin", ''), p."gstin"),
  "registration_no" = coalesce(nullif(c."registration_no", ''), p."registration_no"),
  "footer_note" = coalesce(c."footer_note", p."footer_note"),
  "consent_text" = coalesce(c."consent_text", p."consent_text")
FROM "clinic_profile" p
WHERE p."id" = 'default' AND c."slug" = 'clinic-1';--> statement-breakpoint
UPDATE "clinic" SET "short_name" = coalesce("short_name", 'Predict X Apollo'), "receipt_prefix" = 'PXA' WHERE "slug" = 'predict-x-apollo';--> statement-breakpoint

-- Receipt numbers per clinic: OPTM/26-27/00080 and PXA/26-27/00001 each count
-- on their own. A new table, so the old single counter keeps working until
-- the code that uses this one is live; the first number drawn here starts
-- after the highest one that clinic has already printed (see nextReceiptNo).
CREATE TABLE IF NOT EXISTS "clinic_receipt_counter" (
  "clinic_id" text NOT NULL REFERENCES "clinic"("id") ON DELETE cascade,
  "financial_year" text NOT NULL,
  "last_number" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("clinic_id", "financial_year")
);
