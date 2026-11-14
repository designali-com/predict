-- Clinic pages stop being named after roles.
--
-- /doctor/patient, /nutritionist/appointments, /superadmin/team: the routes
-- and the permission keys both began with a role. That was accurate while
-- roles were an enum in code, and wrong the moment a clinic could create one
-- of its own — a therapist granted the patient list would open a page
-- addressed to a doctor and hold a permission with "doctor" in its name.
--
-- Merging also removes the duplicates. Patients existed three times over and
-- Appointments twice, identical but for the prefix, so the editor showed
-- twenty-nine rows for what is really nine pages.
--
-- Insert-then-delete rather than UPDATE: several old keys collapse into one,
-- so a role holding two of them would collide with itself on the
-- (role, permission) unique index partway through an UPDATE.

CREATE TEMP TABLE "permission_move" ("old" text PRIMARY KEY, "new" text NOT NULL) ON COMMIT DROP;--> statement-breakpoint

INSERT INTO "permission_move" ("old", "new") VALUES
  ('clinic.doctor.home',              'clinic.home'),
  ('clinic.nutritionist.home',        'clinic.home'),
  ('clinic.admin.home',               'clinic.home'),
  ('clinic.superadmin.home',          'clinic.home'),
  ('clinic.doctor.patients',          'clinic.patients'),
  ('clinic.admin.patients',           'clinic.patients'),
  ('clinic.superadmin.patients',      'clinic.patients'),
  ('clinic.doctor.appointments',      'clinic.appointments'),
  ('clinic.nutritionist.appointments','clinic.appointments'),
  -- Two different pages wore the word "team". The doctor's was a read-only
  -- look at colleagues and their calendars; the admin's was staff accounts.
  -- They keep that distinction under names that say which is which.
  ('clinic.doctor.team',              'clinic.directory'),
  ('clinic.nutritionist.team',        'clinic.directory'),
  ('clinic.admin.team',               'clinic.team'),
  ('clinic.superadmin.team',          'clinic.team'),
  ('clinic.superadmin.roles',         'clinic.roles'),
  ('clinic.admin.intake',             'clinic.intake'),
  ('clinic.superadmin.biomarkers',    'clinic.biomarkers'),
  ('clinic.superadmin.ai',            'clinic.ai');--> statement-breakpoint

INSERT INTO "role_permission" ("id", "role", "permission", "granted_by_user_id")
SELECT gen_random_uuid()::text, rp."role", m."new", min(rp."granted_by_user_id")
FROM "role_permission" rp
JOIN "permission_move" m ON m."old" = rp."permission"
GROUP BY rp."role", m."new"
ON CONFLICT ("role", "permission") DO NOTHING;--> statement-breakpoint

-- bool_or because an override on any of the merged pages meant "this person
-- may open it" — the grant survives the merge; a revoke on one of several
-- does not outvote it.
INSERT INTO "user_permission" ("id", "user_id", "permission", "granted", "granted_by_user_id")
SELECT gen_random_uuid()::text, up."user_id", m."new", bool_or(up."granted"), min(up."granted_by_user_id")
FROM "user_permission" up
JOIN "permission_move" m ON m."old" = up."permission"
GROUP BY up."user_id", m."new"
ON CONFLICT ("user_id", "permission") DO NOTHING;--> statement-breakpoint

DELETE FROM "role_permission" WHERE "permission" IN (SELECT "old" FROM "permission_move");--> statement-breakpoint

DELETE FROM "user_permission" WHERE "permission" IN (SELECT "old" FROM "permission_move");
