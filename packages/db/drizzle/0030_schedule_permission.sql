-- Directory becomes Schedule.
--
-- /directory was three hard-coded role cards (doctor, health_coach,
-- nutritionist — so a role a clinic invents never appeared), a list of names
-- that duplicated /team, and two of its three detail pages said "No detail view
-- for this role yet". The one thing on it that existed nowhere else was a
-- doctor's month calendar of booked appointments — and once availability moved
-- into this system that calendar started lying, printing "No appointments —
-- free" on days the doctor was not working or was on leave.
--
-- What replaces it is the week across every clinician: booked against capacity
-- per day, leave shown as leave, and the therapy due each day. That is the
-- screen a front desk actually needs to answer "can you fit me in on Thursday?".
--
-- Anyone who could open Directory can open Schedule. Insert-then-delete rather
-- than UPDATE for the same reason as 0015: a role holding both keys would
-- collide with itself on the (role, permission) unique index partway through.

INSERT INTO "role_permission" ("id", "role", "permission", "granted_by_user_id")
SELECT gen_random_uuid()::text, rp."role", 'clinic.schedule', rp."granted_by_user_id"
FROM "role_permission" rp
WHERE rp."permission" = 'clinic.directory'
ON CONFLICT ("role", "permission") DO NOTHING;--> statement-breakpoint

-- Per-person overrides carry across keeping their sign: somebody explicitly
-- denied the directory is denied the schedule, not silently re-granted it.
INSERT INTO "user_permission" ("id", "user_id", "permission", "granted", "granted_by_user_id")
SELECT gen_random_uuid()::text, up."user_id", 'clinic.schedule', up."granted", up."granted_by_user_id"
FROM "user_permission" up
WHERE up."permission" = 'clinic.directory'
ON CONFLICT ("user_id", "permission") DO NOTHING;--> statement-breakpoint

DELETE FROM "role_permission" WHERE "permission" = 'clinic.directory';--> statement-breakpoint
DELETE FROM "user_permission" WHERE "permission" = 'clinic.directory';
