-- The lab (lab.predict.fit): every blood-test order, from our clinics and from
-- partner hospitals, worked through collection, payment and report.
-- An order now says how and when the sample is taken; who takes it; and the
-- lab's own notes. See packages/db/src/lab-orders.ts and apps/clinic/src/app/lab.

ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "collection_mode" text;
--> statement-breakpoint
ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp;
--> statement-breakpoint
ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "collection_address" text;
--> statement-breakpoint
ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "technician" text;
--> statement-breakpoint
ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "lab_note" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blood_test_order_status_idx" ON "blood_test_order" ("status", "scheduled_at");
--> statement-breakpoint
INSERT INTO "role" ("key", "label", "description", "panel", "is_system", "sort_order", "created_at", "updated_at")
VALUES (
  'lab_staff',
  'Lab staff',
  'Predict lab team: books sample collection (centre or home), takes payment, marks samples collected, uploads and confirms reports.',
  'clinic', true, 65, now(), now()
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission" ("id", "role", "permission", "created_at") VALUES
  (gen_random_uuid()::text, 'lab_staff', 'clinic.lab', now()),
  (gen_random_uuid()::text, 'lab_staff', 'clinic.patients', now()),
  (gen_random_uuid()::text, 'admin', 'clinic.lab', now())
ON CONFLICT ("role", "permission") DO NOTHING;
