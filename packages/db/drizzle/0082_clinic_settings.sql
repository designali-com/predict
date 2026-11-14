-- Clinic settings (the clinic's details as they print on receipts and reports)
-- moved off the Billing page to their own page, for admins.

INSERT INTO "role_permission" ("id", "role", "permission", "created_at") VALUES
  (gen_random_uuid()::text, 'admin', 'clinic.settings', now())
ON CONFLICT ("role", "permission") DO NOTHING;
