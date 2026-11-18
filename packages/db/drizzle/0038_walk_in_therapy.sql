-- Therapy bought one session at a time.
--
-- Some long-standing patients stopped taking consultations years ago. They
-- turn up when they feel like it, pay for the therapy they have that day, and
-- leave. Not a 21-day course — one session, or two, or three, with weeks in
-- between. Until now that was a paper log sheet and nothing else: the therapy
-- was not recorded, the medicine it used never came off the shelf, and no
-- receipt was ever issued for the money.
--
-- It is modelled as an enrolment because everything downstream hangs off one:
-- plan_sitting is the log sheet, stock consumption reads the enrolment's
-- medicine lines, and a payment settles an enrolment. A second, parallel way
-- of recording a therapy day would have to reimplement all three and would
-- disagree with them within a month.
--
-- What makes it different is that it is OPEN-ENDED. Nothing is scheduled
-- ahead: a sitting is created on the day it happens, the count grows with it,
-- and the price grows by one session's rate each time. That keeps the billing,
-- the progress and the receipts working unchanged — an enrolment where
-- sittings and price both track what has actually happened is always paid up
-- and never owes for days nobody has had.

ALTER TABLE "treatment_plan"
  ADD COLUMN IF NOT EXISTS "is_per_session" boolean DEFAULT false NOT NULL;--> statement-breakpoint

ALTER TABLE "plan_enrollment"
  -- Snapshotted, like the price and the advance: what this enrolment IS must
  -- not change because somebody edited the catalogue afterwards.
  ADD COLUMN IF NOT EXISTS "is_per_session" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- The two walk-in rates, taken from the clinic's own package sheet: the
-- treatment line on every two-limb plan is ₹1,500 a session and on every
-- four-limb plan ₹2,200. Nothing here is invented — it is the same rate, sold
-- one at a time instead of six.
INSERT INTO "treatment_plan"
  ("id", "name", "limbs", "duration_days", "sittings", "price_in_paise",
   "advance_percent", "is_active", "is_per_session", "description")
VALUES
  ('plan_two_session', 'Two Limbs — single session', 'two', 1, 1, 150000, 0, true, true,
   'Walk-in therapy, paid for one session at a time.'),
  ('plan_four_session', 'Four Limbs — single session', 'four', 1, 1, 220000, 0, true, true,
   'Walk-in therapy, paid for one session at a time.')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- The treatment itself, at the rate above.
INSERT INTO "treatment_plan_item" ("id", "plan_id", "kind", "name", "quantity", "rate_in_paise", "sort_order")
VALUES
  (gen_random_uuid()::text, 'plan_two_session',  'treatment', 'Treatment', 1, 150000, 0),
  (gen_random_uuid()::text, 'plan_four_session', 'treatment', 'Treatment', 1, 220000, 0)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- The medicine a session uses, at zero rate.
--
-- Not a charge: the rate above covers it. It is here because it is what tells
-- the storeroom which tins a session draws on — consumption reads the
-- enrolment's medicine lines, so a walk-in session with none would quietly use
-- medicine that never left the shelf on paper.
INSERT INTO "treatment_plan_item"
  ("id", "plan_id", "kind", "medicine_id", "name", "quantity", "rate_in_paise", "sort_order")
SELECT gen_random_uuid()::text, v."plan", 'medicine', m."id", m."name", 1, 0, 1
FROM (VALUES
  ('plan_two_session',  '(2 BHT + LL + NPF-1) Combo'),
  ('plan_four_session', '(2-JP + LL + NPF-1) Combo')
) AS v("plan", "medicine")
JOIN "medicine" m ON m."name" = v."medicine"
ON CONFLICT DO NOTHING;
