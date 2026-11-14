-- Sign-in links the clinic sends a patient: open it, the dashboard opens.
-- Reusable until expires_at (7 days) or revoked_at. Only the SHA-256 of the
-- token is stored; the link is shown once, when it is made.

CREATE TABLE IF NOT EXISTS "login_link" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL UNIQUE,
  "created_by_user_id" text,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "last_used_at" timestamp,
  "use_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_link_user_idx" ON "login_link" ("user_id");
