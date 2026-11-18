-- Partner hospitals (Apollo first): a clinic of kind 'partner'. Its doctors
-- see only the patients their hospital registered, prescribe the Predict blood
-- test, read the results and plans, and hand the patient their dashboard.
-- The blood test itself is done by Predict (lab.predict.fit).
-- See apps/clinic/src/lib/auth/patient-scope.ts.

ALTER TABLE "clinic" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'clinic' NOT NULL;
--> statement-breakpoint
INSERT INTO "role" ("key", "label", "description", "panel", "is_system", "sort_order", "created_at", "updated_at")
VALUES (
  'partner_doctor',
  'Partner doctor',
  'A doctor at a partner hospital: registers their patients, prescribes the Predict blood test, reads results and plans, gives the patient app access. Sees only their hospital''s patients.',
  'clinic', true, 60, now(), now()
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission" ("id", "role", "permission", "created_at")
VALUES (gen_random_uuid()::text, 'partner_doctor', 'clinic.patients', now())
ON CONFLICT ("role", "permission") DO NOTHING;
