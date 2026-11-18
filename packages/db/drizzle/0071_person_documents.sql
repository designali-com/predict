CREATE TABLE IF NOT EXISTS "person_document" (
  "id" text PRIMARY KEY,
  "contact_id" text NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  "appointment_id" text REFERENCES "appointment"("id") ON DELETE SET NULL,
  "file_url" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer,
  "kind" text NOT NULL DEFAULT 'other',
  "note" text,
  "uploaded_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "person_document_contact_created_idx"
  ON "person_document" ("contact_id", "created_at");
