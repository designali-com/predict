-- Per-user departures from what a role gives.
--
-- The role-level table alone said every doctor does the same job, which is not
-- true of any clinic: one covers the intake queue, another does not. But
-- dropping roles entirely would mean configuring each new hire from zero, so
-- the role stays as a baseline and this records only the differences.
--
-- `granted` is a genuine boolean here, unlike role_permission. There a row
-- meant yes and its absence meant no — two states. Here there are three, and
-- the third is the important one: no row means "inherit", which keeps tracking
-- the role as the role changes. A row that merely repeated the role's current
-- answer would freeze it silently.
--
-- Hand-authored in the style of 0006-0011. Additive only.

CREATE TABLE IF NOT EXISTS "user_permission" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "permission" text NOT NULL,
  "granted" boolean NOT NULL,
  "granted_by_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "user_permission"
  ADD CONSTRAINT "user_permission_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "user_permission"
  ADD CONSTRAINT "user_permission_granted_by_user_id_user_id_fk"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- One override per person per permission; re-setting it updates in place
-- rather than stacking contradictory rows.
CREATE UNIQUE INDEX IF NOT EXISTS "user_permission_user_permission_unique"
  ON "user_permission" ("user_id", "permission");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_permission_user_idx"
  ON "user_permission" ("user_id");
