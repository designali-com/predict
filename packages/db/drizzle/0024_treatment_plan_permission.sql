-- Treatment Plans is a new page, so nobody holds it yet.
--
-- DEFAULT_GRANTS in permissions.ts only applies to a fresh install; once a role
-- has rows, that file has no further say, or every deploy would undo whatever
-- was configured. So the one default that matters is written here instead:
-- admin, which is the role that already owns the care plan library and the
-- rest of Administration. Superadmin bypasses the tables entirely.
--
-- Anyone else who should price plans gets it from the permission editor, which
-- is the point of the feature.

INSERT INTO "role_permission" ("id", "role", "permission", "granted_by_user_id")
SELECT gen_random_uuid()::text, 'admin', 'clinic.treatment_plans', NULL
WHERE EXISTS (SELECT 1 FROM "role" WHERE "key" = 'admin')
ON CONFLICT ("role", "permission") DO NOTHING;
