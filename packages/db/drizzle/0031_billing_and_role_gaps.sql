-- Billing, and the role grants the audit turned up.
--
-- The payment ledger, the consultation fee and the advance rule all exist and
-- nothing in the clinic panel could reach any of them: no screen recorded a
-- payment. That blocked the whole flow — the fee never cleared, so no visit
-- ever became visible to a doctor, and no plan advance was ever met, so
-- activateEnrollment could never succeed.
--
-- Three role gaps fixed at the same time, all of them "this person cannot do
-- their job" rather than preference:
--
--   admin        had no appointments and no schedule — the role whose whole
--                description is running the clinic day to day could not see
--                the appointment book.
--   nutritionist had no patients, so the consultation they are booked for had
--                no chart to open.
--   receptionist worked in both panels but held no clinic pages at all here.
--
-- Grants only, and additive: nothing is taken away from anyone.

INSERT INTO "role_permission" ("id", "role", "permission", "granted_by_user_id")
SELECT gen_random_uuid()::text, g."role", g."permission", NULL
FROM (VALUES
  -- Whoever takes money at the desk.
  ('receptionist', 'clinic.billing'),
  ('admin',        'clinic.billing'),
  -- The front desk works in the clinic panel too — booking, registration and
  -- the fee all live here now.
  ('receptionist', 'clinic.home'),
  ('receptionist', 'clinic.appointments'),
  ('receptionist', 'clinic.patients'),
  ('receptionist', 'clinic.schedule'),
  -- Runs the clinic day to day; could not open the appointment book.
  ('admin',        'clinic.appointments'),
  ('admin',        'clinic.schedule'),
  -- Booked for consultations with no way to open the patient.
  ('nutritionist', 'clinic.patients'),
  -- Both prescribe from the library; neither could open it.
  ('nutritionist', 'clinic.care_plan_library'),
  ('doctor',       'clinic.care_plan_library')
) AS g("role", "permission")
WHERE EXISTS (SELECT 1 FROM "role" r WHERE r."key" = g."role")
ON CONFLICT ("role", "permission") DO NOTHING;
