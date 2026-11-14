-- Medicine bills, apart from their payments.
--
-- A medicine sale used to be its payment, so medicine handed over now and paid
-- for later could not be recorded at all — the desk had to take the money or
-- not sell. A sale is now its own bill (lines, each with an optional % or ₹
-- discount) and payments point at it; the bill less its live payments is what
-- is owed, and it shows with the patient's other dues.
--
-- Sales made before this keep their payment only; they were paid in full.

CREATE TABLE IF NOT EXISTS "medicine_sale" (
  "id" text PRIMARY KEY,
  "contact_id" text NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "clinic_id" text REFERENCES "clinic"("id") ON DELETE SET NULL,
  "appointment_id" text REFERENCES "appointment"("id") ON DELETE SET NULL,
  "gross_in_paise" integer NOT NULL,
  "discount_in_paise" integer NOT NULL DEFAULT 0,
  "total_in_paise" integer NOT NULL CHECK ("total_in_paise" >= 0),
  "note" text,
  "sold_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "sold_at" timestamp NOT NULL DEFAULT now(),
  "voided_at" timestamp,
  "void_reason" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medicine_sale_contact_idx" ON "medicine_sale" ("contact_id", "sold_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medicine_sale_clinic_idx" ON "medicine_sale" ("clinic_id", "sold_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medicine_sale_line" (
  "id" text PRIMARY KEY,
  "sale_id" text NOT NULL REFERENCES "medicine_sale"("id") ON DELETE CASCADE,
  "medicine_id" text REFERENCES "medicine"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "quantity" integer NOT NULL CHECK ("quantity" > 0),
  "rate_in_paise" integer NOT NULL CHECK ("rate_in_paise" >= 0),
  "discount_type" text,
  "discount_value" double precision,
  "discount_in_paise" integer NOT NULL DEFAULT 0,
  "amount_in_paise" integer NOT NULL CHECK ("amount_in_paise" >= 0),
  "sort_order" integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medicine_sale_line_sale_idx" ON "medicine_sale_line" ("sale_id");
--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "medicine_sale_id" text REFERENCES "medicine_sale"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_medicine_sale_idx" ON "payment" ("medicine_sale_id");
