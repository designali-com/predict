-- "People" becomes Leads and Patients.
--
-- The operations console had one list for everyone on record with stage as a
-- filter, behind a single permission, ops.people. That was fine as a screen and
-- wrong as a grant: a health coach who needs to chase enquiries had to be given
-- the clinical record of every patient in the building to do it.
--
-- Everyone who could open People can open both lists, so nobody loses access on
-- deploy. Narrowing someone to one side is now a thing you can do from the
-- permission editor, which is the point.
--
-- Insert-then-delete rather than UPDATE: one old key becomes two, and an UPDATE
-- would have to pick one of them.

INSERT INTO "role_permission" ("id", "role", "permission", "granted_by_user_id")
SELECT gen_random_uuid()::text, rp."role", k."new", rp."granted_by_user_id"
FROM "role_permission" rp
CROSS JOIN (VALUES ('ops.leads'), ('ops.patients')) AS k("new")
WHERE rp."permission" = 'ops.people'
ON CONFLICT ("role", "permission") DO NOTHING;--> statement-breakpoint

-- Per-person overrides carry across the same way, keeping their sign: someone
-- explicitly denied People is denied both lists, not silently re-granted one.
INSERT INTO "user_permission" ("id", "user_id", "permission", "granted", "granted_by_user_id")
SELECT gen_random_uuid()::text, up."user_id", k."new", up."granted", up."granted_by_user_id"
FROM "user_permission" up
CROSS JOIN (VALUES ('ops.leads'), ('ops.patients')) AS k("new")
WHERE up."permission" = 'ops.people'
ON CONFLICT ("user_id", "permission") DO NOTHING;--> statement-breakpoint

DELETE FROM "role_permission" WHERE "permission" = 'ops.people';--> statement-breakpoint
DELETE FROM "user_permission" WHERE "permission" = 'ops.people';
