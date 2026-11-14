-- The clinic's consultation fee is ₹1,200, not ₹1,500.
--
-- Every booking that does not set its own fee takes the column default, so the
-- default is the fee. Kept equal to DEFAULT_CONSULTATION_FEE_PAISE in
-- packages/db/src/payment.ts.
--
-- Bookings already made keep what they were booked at, except ones still
-- waiting to be paid: those were quoted the wrong default, not a concession.

ALTER TABLE "appointment" ALTER COLUMN "fee_in_paise" SET DEFAULT 120000;
--> statement-breakpoint
UPDATE "appointment" a SET "fee_in_paise" = 120000, "updated_at" = now() AT TIME ZONE 'utc'
WHERE a."fee_in_paise" = 150000
  AND a."status" NOT IN ('cancelled', 'completed', 'no_show')
  AND a."type" = 'consultation'
  AND NOT EXISTS (
    SELECT 1 FROM "payment" p
    WHERE p."appointment_id" = a."id" AND p."kind" = 'consultation' AND p."voided_at" IS NULL
  );
