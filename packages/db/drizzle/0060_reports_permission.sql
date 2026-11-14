-- Reports: whoever already sees the money or runs the marketing.
--
-- The roles are collapsed BEFORE the uuid is generated: a role holding two of
-- the source permissions would otherwise produce two rows, and (role,
-- permission) is unique.
INSERT INTO "role_permission" ("id", "role", "permission", "created_at")
SELECT gen_random_uuid()::text, r."role", 'ops.reports', now()
FROM (
  SELECT DISTINCT rp."role"
  FROM "role_permission" rp
  WHERE rp."permission" IN ('ops.campaigns', 'clinic.reports', 'clinic.billing')
) r
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permission" x WHERE x."role" = r."role" AND x."permission" = 'ops.reports'
);
