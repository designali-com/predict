-- When the patient actually walked in.
--
-- Kept apart from `status` on purpose. Confirmation and arrival are two
-- independent facts: an online booking is confirmed three days before anybody
-- arrives, and a walk-in arrives having confirmed nothing. Squeezing both into
-- one enum would mean setting "arrived" erases "confirmed", and the fact that
-- the booking was ever confirmed is lost for good.
--
-- It also cannot be a status value because `confirmed` is a domain event any
-- automation can trigger on. Firing it when somebody pays a fee at the counter
-- would send "your booking is confirmed" to a patient standing at the desk.
--
-- A timestamp rather than a flag, because the useful question is not only
-- "are they here" but "how long have they been waiting" — arrived 10:42, seen
-- 11:15 — and a boolean can never answer the second.

ALTER TABLE "appointment" ADD COLUMN IF NOT EXISTS "arrived_at" timestamp;--> statement-breakpoint

-- Who is in the building today. The desk reads this every few minutes.
CREATE INDEX IF NOT EXISTS "appointment_arrived_idx"
  ON "appointment" ("arrived_at")
  WHERE "arrived_at" IS NOT NULL;
