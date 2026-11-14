-- Expenses: money out, beside payments' money in.
--
-- Entered from Billing → Expenses by anyone who takes payments; seeing every
-- expense, the profit figure and voiding one is clinic.expenses_all (admin and
-- manager). Rent and salaries can repeat monthly — each month's row is written
-- once, the first time Billing is opened on or after its day.

CREATE TABLE IF NOT EXISTS "expense_recurring" (
  "id" text PRIMARY KEY,
  "clinic_id" text NOT NULL REFERENCES "clinic"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "amount_in_paise" integer NOT NULL CHECK ("amount_in_paise" > 0),
  "method" text NOT NULL DEFAULT 'bank',
  "paid_to" text,
  "note" text,
  "day_of_month" integer NOT NULL DEFAULT 1 CHECK ("day_of_month" BETWEEN 1 AND 28),
  "starts_on" date NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_recurring_clinic_idx" ON "expense_recurring" ("clinic_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense" (
  "id" text PRIMARY KEY,
  "clinic_id" text NOT NULL REFERENCES "clinic"("id") ON DELETE CASCADE,
  "spent_on" date NOT NULL,
  "category" text NOT NULL,
  "amount_in_paise" integer NOT NULL CHECK ("amount_in_paise" > 0),
  "method" text NOT NULL,
  "paid_to" text,
  "reference" text,
  "note" text,
  "bill_url" text,
  "bill_name" text,
  "recurring_id" text REFERENCES "expense_recurring"("id") ON DELETE SET NULL,
  "recurring_month" text,
  "voided_at" timestamp,
  "void_reason" text,
  "voided_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_clinic_day_idx" ON "expense" ("clinic_id", "spent_on");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_recurring_month_unique" ON "expense" ("recurring_id", "recurring_month");
--> statement-breakpoint
-- Everything about expenses for admin and manager; the manager also needs the
-- Billing page to reach them.
INSERT INTO "role_permission" ("id", "role", "permission")
SELECT gen_random_uuid()::text, r.role, r.permission
FROM (VALUES ('admin', 'clinic.expenses_all'), ('manager', 'clinic.expenses_all'), ('manager', 'clinic.billing')) AS r(role, permission)
WHERE NOT EXISTS (SELECT 1 FROM "role_permission" rp WHERE rp.role = r.role AND rp.permission = r.permission);
