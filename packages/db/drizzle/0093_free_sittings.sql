-- Free sittings: clinic treatments given at no charge on top of what a
-- course's plan includes — an out-station patient given 3 to 5 treatments
-- for the price of the plan's one, an in-station patient given a couple more.
--
-- plan_enrollment.sittings stays the number that can be logged (paid + free),
-- so every count that reads it is right as it is; free_sittings says how many
-- of those are free. The bill does not change — it comes from the bill lines.
--
-- A sitting given free is marked on its row, and takes no medicine off the
-- shelf: anything the patient needs then is sold separately.
ALTER TABLE "plan_enrollment" ADD COLUMN IF NOT EXISTS "free_sittings" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "plan_sitting" ADD COLUMN IF NOT EXISTS "is_free" boolean NOT NULL DEFAULT false;
