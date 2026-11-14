CREATE TABLE IF NOT EXISTS "contact_note" (
  "id" text PRIMARY KEY,
  "contact_id" text NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "author_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "author_role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "contact_note_contact_created_idx"
  ON "contact_note" ("contact_id", "created_at");
