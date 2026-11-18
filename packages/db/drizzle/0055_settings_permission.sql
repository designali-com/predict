-- Whoever can edit flows can edit the rules those flows run under.
INSERT INTO "role_permission" ("id", "role", "permission", "created_at")
SELECT gen_random_uuid()::text, rp."role", 'ops.automation_settings', now()
FROM "role_permission" rp
WHERE rp."permission" = 'ops.flows'
  AND NOT EXISTS (SELECT 1 FROM "role_permission" x WHERE x."role" = rp."role" AND x."permission" = 'ops.automation_settings');
