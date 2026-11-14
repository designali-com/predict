-- Therapists, and which one each therapy hour is with.
--
-- The therapy calendar counted places per hour from one number (capacity),
-- and the desk could not say who would treat whom. Now an hour holds as many
-- patients as there are active therapists, each booking names its therapist,
-- and a therapist is never booked twice in the same hour.

CREATE TABLE IF NOT EXISTS "therapist" (
  "id" text PRIMARY KEY,
  "clinic_id" text NOT NULL REFERENCES "clinic"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "gender" text,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "therapist_clinic_idx" ON "therapist" ("clinic_id");
--> statement-breakpoint
ALTER TABLE "therapy_booking" ADD COLUMN IF NOT EXISTS "therapist_id" text REFERENCES "therapist"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- OPTM's three: one male, two female.
INSERT INTO "therapist" ("id", "clinic_id", "name", "gender", "sort_order")
SELECT gen_random_uuid()::text, '6d1528c4-0c4f-4428-a188-e1445dc426d7', t.name, t.gender, t.ord
FROM (VALUES ('Vishnu', 'male', 1), ('Nisha', 'female', 2), ('Bhawna', 'female', 3)) AS t(name, gender, ord)
WHERE EXISTS (SELECT 1 FROM "clinic" WHERE "id" = '6d1528c4-0c4f-4428-a188-e1445dc426d7')
  AND NOT EXISTS (SELECT 1 FROM "therapist" x WHERE x."clinic_id" = '6d1528c4-0c4f-4428-a188-e1445dc426d7' AND lower(x."name") = lower(t.name));
--> statement-breakpoint
-- Three therapists, three places an hour (was set to 1).
UPDATE "therapy_schedule" SET "capacity" = 3, "updated_at" = now() WHERE "clinic_id" = '6d1528c4-0c4f-4428-a188-e1445dc426d7';
