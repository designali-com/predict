-- A discount on a treatment package, as its own figure.
--
-- The bill was always the package lines added up, and the "price charged"
-- typed at the desk was stored but never read back — so a discount given to a
-- patient vanished from the bill, the balance and the advance. Now it is kept
-- here and taken off the lines everywhere the bill is worked out
-- (enrollmentBill in packages/db/src/treatment-plan.ts).

ALTER TABLE "plan_enrollment" ADD COLUMN IF NOT EXISTS "discount_in_paise" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "plan_enrollment" ADD COLUMN IF NOT EXISTS "discount_percent" double precision;
--> statement-breakpoint
ALTER TABLE "plan_enrollment" ADD COLUMN IF NOT EXISTS "discount_reason" text;
