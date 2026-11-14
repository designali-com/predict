-- Multi-clinic: two clinics today, more later, one database.
--
-- Every clinic keeps its own leads, appointments, doctors, staff and money.
-- A person logs in once and works inside whichever clinic they belong to; a
-- superadmin stands outside all of them and sees everything.
--
-- Row-level tenancy (a clinic_id column) rather than a database per clinic:
-- one deploy, one backup, one migration, and "both clinics together" is a
-- query rather than a merge.

CREATE TABLE IF NOT EXISTS "clinic" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  -- Short human handle used in lists and lead routing rules ("delhi").
  "slug" text NOT NULL UNIQUE,
  "city" text,
  "state" text,
  "address_line1" text,
  "address_line2" text,
  "pincode" text,
  "phone" text,
  "email" text,
  "gstin" text,
  "registration_no" text,
  -- Printed on this clinic's bills and forms — each clinic has its own.
  "footer_note" text,
  "consent_text" text,
  -- Where this clinic is, for nearest-clinic lead routing.
  "latitude" double precision,
  "longitude" double precision,
  "timezone" text NOT NULL DEFAULT 'Asia/Kolkata',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Who works where, and as what.
--
-- The role lives here, not on the user: the same person can be a telecaller
-- in one clinic and a manager in another, and nobody needs a second login.
-- user.role stays as the fallback for accounts with no membership yet, and
-- as the one place 'superadmin' is recorded.
CREATE TABLE IF NOT EXISTS "clinic_member" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinic"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_member_unique" ON "clinic_member" ("clinic_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clinic_member_user_idx" ON "clinic_member" ("user_id");
--> statement-breakpoint

-- The first clinic is whatever this database already described in
-- clinic_profile, so nothing is invented and no data moves anywhere
-- surprising. The second clinic is created from the UI.
INSERT INTO "clinic" ("id", "name", "slug", "city", "state", "address_line1", "address_line2", "pincode", "phone", "email", "gstin", "registration_no", "footer_note", "consent_text", "latitude", "longitude")
SELECT
  gen_random_uuid()::text,
  coalesce(p."name", 'OPTM'),
  'clinic-1',
  p."city", p."state", p."address_line1", p."address_line2", p."pincode",
  p."phone", p."email", p."gstin", p."registration_no", p."footer_note", p."consent_text",
  28.61, 77.21
FROM "clinic_profile" p
WHERE NOT EXISTS (SELECT 1 FROM "clinic")
LIMIT 1;
--> statement-breakpoint
-- A database with no clinic_profile row still needs somewhere to put its data.
INSERT INTO "clinic" ("id", "name", "slug", "city", "latitude", "longitude")
SELECT gen_random_uuid()::text, 'OPTM', 'clinic-1', 'Delhi', 28.61, 77.21
WHERE NOT EXISTS (SELECT 1 FROM "clinic");
--> statement-breakpoint

-- Existing staff keep the role they have today, in the first clinic.
INSERT INTO "clinic_member" ("id", "clinic_id", "user_id", "role")
SELECT gen_random_uuid()::text, (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1), u."id", u."role"
FROM "user" u
WHERE u."role" IS NOT NULL
  AND u."role" NOT IN ('user', 'patient', 'superadmin')
  AND NOT EXISTS (SELECT 1 FROM "clinic_member" m WHERE m."user_id" = u."id");
--> statement-breakpoint

-- The tenant columns. Nullable for now: every write path has to start
-- setting them before the database can insist, and a NOT NULL here today
-- would break an insert we have not reached yet. Tightened in a later
-- migration once every path is updated.
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "doctor_availability" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "doctor_time_off" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "plan_enrollment" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "audience" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "lead_submission" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "lead_rule" ADD COLUMN IF NOT EXISTS "clinic_id" text REFERENCES "clinic"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Everything that exists today happened at the first clinic.
UPDATE "contact" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "appointment" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "doctor_availability" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "doctor_time_off" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "task" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "payment" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "plan_enrollment" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "campaign" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "audience" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "lead_submission" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint
UPDATE "lead_rule" SET "clinic_id" = (SELECT "id" FROM "clinic" ORDER BY "created_at" LIMIT 1) WHERE "clinic_id" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "contact_clinic_idx" ON "contact" ("clinic_id", "stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointment_clinic_idx" ON "appointment" ("clinic_id", "scheduled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_clinic_idx" ON "task" ("clinic_id", "status");
