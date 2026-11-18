-- Which role may reach which page.
--
-- Access was decided by hard-coded role lists in each app's config, so adding
-- a role — or letting a receptionist see one extra page — meant a code change
-- and a deploy. The list of permissions stays in code, because a permission
-- only means anything if the page behind it exists; who holds them becomes
-- data, because that changes with how a clinic is staffed.
--
-- Grant-only by design: a row means yes, no row means no. A boolean column
-- would add a third state (present-but-false) that reads the same as absent
-- and eventually disagrees with it.
--
-- Hand-authored in the style of 0006-0010. Additive only; nothing reads this
-- table until the apps are switched over.

CREATE TABLE IF NOT EXISTS "role_permission" (
  "id" text PRIMARY KEY NOT NULL,
  "role" text NOT NULL,
  "permission" text NOT NULL,
  "granted_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "role_permission"
  ADD CONSTRAINT "role_permission_granted_by_user_id_user_id_fk"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- One row per pairing, so re-granting is a no-op rather than a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS "role_permission_role_permission_unique"
  ON "role_permission" ("role", "permission");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "role_permission_role_idx"
  ON "role_permission" ("role");
