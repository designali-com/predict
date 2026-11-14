-- Clinic-panel bookings were inserted without clinic_id, so the appointments
-- list (filtered by clinic) never showed them. Stamp the ones already saved.

-- A doctor who works at exactly one clinic.
UPDATE "appointment" a
SET "clinic_id" = m."clinic_id"
FROM (
  SELECT "user_id", min("clinic_id") AS "clinic_id"
  FROM "clinic_member"
  GROUP BY "user_id"
  HAVING count(DISTINCT "clinic_id") = 1
) m
WHERE a."clinic_id" IS NULL
  AND a."doctor_user_id" = m."user_id";

-- Else the clinic on that doctor's working hours, when it is unambiguous.
UPDATE "appointment" a
SET "clinic_id" = h."clinic_id"
FROM (
  SELECT "doctor_user_id", min("clinic_id") AS "clinic_id"
  FROM "doctor_availability"
  WHERE "clinic_id" IS NOT NULL
  GROUP BY "doctor_user_id"
  HAVING count(DISTINCT "clinic_id") = 1
) h
WHERE a."clinic_id" IS NULL
  AND a."doctor_user_id" = h."doctor_user_id";

-- Else the patient's clinic.
UPDATE "appointment" a
SET "clinic_id" = c."clinic_id"
FROM "contact" c
WHERE a."clinic_id" IS NULL
  AND a."contact_id" = c."id"
  AND c."clinic_id" IS NOT NULL;

-- A single-clinic install: anything still blank belongs there.
UPDATE "appointment"
SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1)
WHERE "clinic_id" IS NULL
  AND (SELECT count(*) FROM "clinic") = 1;
