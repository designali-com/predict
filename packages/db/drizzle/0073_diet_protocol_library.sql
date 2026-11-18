-- The clinic's library of dietary protocols — written once by a nutritionist,
-- kept in veg / egg / non-veg variants, and copied onto a patient (where it
-- can be adjusted) instead of being retyped for each one.
-- See packages/db/src/diet-protocol-library.ts.

CREATE TABLE IF NOT EXISTS "diet_protocol_template" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "diet" text,
  "protocol" jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "updated_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diet_protocol_template_active_idx" ON "diet_protocol_template" ("is_active", "name");
