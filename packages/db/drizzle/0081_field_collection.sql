-- Field collection and the external lab.
--   * A home (or centre) collection is assigned to a field technician — a
--     login of their own, our staff or an agency's — who marks it on the way,
--     collected (with the kit's unique code: three tubes, needles, one kit) or
--     not collected. See apps/clinic/src/app/field.
--   * Samples go to an outside lab: the lab team marks an order sent, to whom,
--     and when the report is expected.
--   * Every step is stamped in blood_test_order_event — who did what, when.

ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "technician_user_id" text REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "kit_code" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blood_test_order_kit_code_unique" ON "blood_test_order" ("kit_code") WHERE "kit_code" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "on_the_way_at" timestamp;
--> statement-breakpoint
ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "sent_to_lab_at" timestamp;
--> statement-breakpoint
ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "external_lab" text;
--> statement-breakpoint
ALTER TABLE "blood_test_order" ADD COLUMN IF NOT EXISTS "expected_report_on" date;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blood_test_order_technician_idx" ON "blood_test_order" ("technician_user_id", "scheduled_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blood_test_order_event" (
  "id" text PRIMARY KEY NOT NULL,
  "order_id" text NOT NULL REFERENCES "blood_test_order"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "note" text,
  "actor_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blood_test_order_event_order_idx" ON "blood_test_order_event" ("order_id", "created_at");
--> statement-breakpoint
INSERT INTO "role" ("key", "label", "description", "panel", "is_system", "sort_order", "created_at", "updated_at")
VALUES (
  'field_technician',
  'Field technician',
  'Takes blood samples — at the patient''s home or the centre. Sees only the visits assigned to them and updates them: on the way, collected (kit code), not collected. Our staff or an agency''s.',
  'clinic', true, 66, now(), now()
)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission" ("id", "role", "permission", "created_at") VALUES
  (gen_random_uuid()::text, 'field_technician', 'clinic.field', now())
ON CONFLICT ("role", "permission") DO NOTHING;
