-- Four list pages became one Team page, and Permissions became Roles.
--
-- The grants naming the old pages are not wrong so much as pointing at routes
-- that no longer exist, and a grant nothing renders is invisible: the editor
-- cannot show it, so nobody can find it to remove it. Each one is moved to the
-- page that absorbed it rather than dropped, so a clinic that had configured
-- who may manage staff keeps that answer.
--
-- Insert-then-delete rather than UPDATE: three old keys collapse into one, so
-- a role holding both Doctors and Nutritionists would collide with itself on
-- the (role, permission) unique index halfway through an UPDATE. Inserting the
-- destination once per role and dropping the sources afterwards has no such
-- intermediate state.

INSERT INTO "role_permission" ("id", "role", "permission", "granted_by_user_id")
SELECT gen_random_uuid()::text, "role", 'clinic.admin.team', min("granted_by_user_id")
FROM "role_permission"
WHERE "permission" IN ('clinic.admin.doctors', 'clinic.admin.health_coach', 'clinic.admin.nutritionist')
GROUP BY "role"
ON CONFLICT ("role", "permission") DO NOTHING;--> statement-breakpoint

INSERT INTO "role_permission" ("id", "role", "permission", "granted_by_user_id")
SELECT gen_random_uuid()::text, "role", 'clinic.superadmin.team', min("granted_by_user_id")
FROM "role_permission"
WHERE "permission" IN ('clinic.superadmin.admins', 'clinic.superadmin.doctors',
                       'clinic.superadmin.health_coach', 'clinic.superadmin.nutritionist')
GROUP BY "role"
ON CONFLICT ("role", "permission") DO NOTHING;--> statement-breakpoint

INSERT INTO "role_permission" ("id", "role", "permission", "granted_by_user_id")
SELECT gen_random_uuid()::text, "role", 'clinic.superadmin.roles', min("granted_by_user_id")
FROM "role_permission"
WHERE "permission" = 'clinic.superadmin.permissions'
GROUP BY "role"
ON CONFLICT ("role", "permission") DO NOTHING;--> statement-breakpoint

DELETE FROM "role_permission" WHERE "permission" IN (
  'clinic.admin.doctors', 'clinic.admin.health_coach', 'clinic.admin.nutritionist',
  'clinic.superadmin.admins', 'clinic.superadmin.doctors',
  'clinic.superadmin.health_coach', 'clinic.superadmin.nutritionist',
  'clinic.superadmin.permissions'
);--> statement-breakpoint

-- Per-user overrides move the same way. bool_or because an override on any of
-- the merged pages meant "this person may manage staff" — the grant survives
-- the merge, a revoke on one of several does not outvote it.
INSERT INTO "user_permission" ("id", "user_id", "permission", "granted", "granted_by_user_id")
SELECT gen_random_uuid()::text, "user_id", 'clinic.admin.team', bool_or("granted"), min("granted_by_user_id")
FROM "user_permission"
WHERE "permission" IN ('clinic.admin.doctors', 'clinic.admin.health_coach', 'clinic.admin.nutritionist')
GROUP BY "user_id"
ON CONFLICT ("user_id", "permission") DO NOTHING;--> statement-breakpoint

INSERT INTO "user_permission" ("id", "user_id", "permission", "granted", "granted_by_user_id")
SELECT gen_random_uuid()::text, "user_id", 'clinic.superadmin.team', bool_or("granted"), min("granted_by_user_id")
FROM "user_permission"
WHERE "permission" IN ('clinic.superadmin.admins', 'clinic.superadmin.doctors',
                       'clinic.superadmin.health_coach', 'clinic.superadmin.nutritionist')
GROUP BY "user_id"
ON CONFLICT ("user_id", "permission") DO NOTHING;--> statement-breakpoint

INSERT INTO "user_permission" ("id", "user_id", "permission", "granted", "granted_by_user_id")
SELECT gen_random_uuid()::text, "user_id", 'clinic.superadmin.roles', bool_or("granted"), min("granted_by_user_id")
FROM "user_permission"
WHERE "permission" = 'clinic.superadmin.permissions'
GROUP BY "user_id"
ON CONFLICT ("user_id", "permission") DO NOTHING;--> statement-breakpoint

DELETE FROM "user_permission" WHERE "permission" IN (
  'clinic.admin.doctors', 'clinic.admin.health_coach', 'clinic.admin.nutritionist',
  'clinic.superadmin.admins', 'clinic.superadmin.doctors',
  'clinic.superadmin.health_coach', 'clinic.superadmin.nutritionist',
  'clinic.superadmin.permissions'
);
