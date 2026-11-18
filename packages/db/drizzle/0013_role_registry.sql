-- Roles become data.
--
-- Until now a role was a hard-coded string in packages/db/src/roles.ts: adding
-- "therapist" meant editing an enum, a panel if-else, three better-auth maps
-- and a deploy. The permissions a role holds were already data (0011); the role
-- itself was not, so half the feature was unreachable from the UI.
--
-- Three columns carry real weight:
--
--   key       immutable. user.role and role_permission.role both store it, so
--             renaming it would orphan every grant and every account. The
--             display name lives in `label` precisely so key never has to move.
--   panel     which panel(s) the role works in: 'clinic', 'operations',
--             'both' or 'patient'. It decides two things at once — which pages
--             the role can even be granted (a doctor is never offered
--             lead-nurture flows) and where a login lands ('both' lands in the
--             clinic panel, which is where user and taxonomy administration
--             lives). This was an if-else that fell through to the patient app
--             for anything it did not recognise, which is exactly what a newly
--             created role would have hit.
--   is_system the eight roles the code itself names. They can be re-granted but
--             not deleted or rekeyed, because code still refers to some of them
--             by name (admin/superadmin bypass, patient onboarding).
--
-- user.role deliberately has no foreign key. Sign-up assigns the default role
-- before anyone has looked at this table, and an account must never fail to be
-- created because of a taxonomy row; resolveRole() already tolerates values
-- that are not here.

CREATE TABLE IF NOT EXISTS "role" (
  "key" text PRIMARY KEY NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "panel" text NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "created_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "role"
  ADD CONSTRAINT "role_panel_check"
  CHECK ("panel" IN ('clinic', 'operations', 'both', 'patient'));--> statement-breakpoint

ALTER TABLE "role"
  ADD CONSTRAINT "role_created_by_user_id_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- The eight roles the code already names, carrying forward exactly the panels
-- the hard-coded map used to give them.
INSERT INTO "role" ("key", "label", "description", "panel", "is_system", "sort_order") VALUES
  ('superadmin',   'Superadmin',    'Full access to every page in both panels. Bypasses permission checks.', 'both',       true, 10),
  ('admin',        'Admin',         'Runs the clinic day to day across both panels.',                        'both',       true, 20),
  ('doctor',       'Doctor',        'Sees patients and works against their chart.',                          'clinic',     true, 30),
  ('nutritionist', 'Nutritionist',  'Designs diet and supplement plans.',                                    'clinic',     true, 40),
  ('health_coach', 'Health Coach',  'Works the funnel and supports patients who hit a problem.',             'operations', true, 50),
  ('receptionist', 'Receptionist',  'Front desk: walk-ins, appointments and the patient list.',              'operations', true, 60),
  ('patient',      'Patient',       'A patient using the product themselves.',                               'patient',    true, 90),
  ('user',         'User',          'The default on sign-up, before a patient record exists.',               'patient',    true, 91)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint

-- A grant for a role that no longer exists is unreadable noise, so deleting a
-- role takes its grants with it. Rekeying is blocked upstream (key is
-- immutable), but cascading the update costs nothing and removes a footgun.
ALTER TABLE "role_permission"
  ADD CONSTRAINT "role_permission_role_role_key_fk"
  FOREIGN KEY ("role") REFERENCES "public"."role"("key")
  ON DELETE cascade ON UPDATE cascade;
