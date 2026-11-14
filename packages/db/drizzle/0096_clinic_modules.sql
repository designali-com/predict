-- OPTM is a clinic: therapy, medicine, appointments and billing. Diagnosis —
-- blood tests, biomarkers, muscle age, biological age, wearables — is
-- Predict's, which OPTM refers patients to, so its pages leave OPTM's panel.
-- Other clinics keep every module until set from the ops console.
UPDATE "clinic"
SET "modules" = '{appointments,therapy,medicine,billing}', "updated_at" = (now() AT TIME ZONE 'utc')
WHERE "id" = '6d1528c4-0c4f-4428-a188-e1445dc426d7';
