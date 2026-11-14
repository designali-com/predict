-- A clinician's own working hours and leave, as a page they can be granted.
--
-- The clinic panel could book against a doctor's availability but had nowhere
-- to set it, so doctor_availability sat empty and the booking form fell back to
-- Cal.com's defaults. Doctors and nutritionists get it by default; anybody else
-- who keeps a calendar can be given it from the Roles page.
INSERT INTO "role_permission" ("id", "role", "permission", "granted_by_user_id")
SELECT gen_random_uuid()::text, r."key", 'clinic.availability', NULL
FROM "role" r
WHERE r."key" IN ('doctor', 'nutritionist')
ON CONFLICT ("role", "permission") DO NOTHING;
