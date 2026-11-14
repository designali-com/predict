-- Clinic administration: who works where. Admins get it; a superadmin has it
-- anyway by standing outside the permission tables. A telecaller does not.
INSERT INTO "role_permission" ("id", "role", "permission", "created_at")
SELECT gen_random_uuid()::text, rp."role", 'ops.clinics', now()
FROM "role_permission" rp
WHERE rp."permission" = 'clinic.team'
  AND NOT EXISTS (SELECT 1 FROM "role_permission" x WHERE x."role" = rp."role" AND x."permission" = 'ops.clinics');
