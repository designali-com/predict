-- Cash moved from the drawer to the clinic's bank account. Not an expense —
-- the money is still the clinic's — so it never touches the profit, only the
-- drawer: cash in − cash out − to bank = what should be in the till.
--
-- Two ways it happens: someone takes it to the bank (via = 'bank', the slip
-- number as the reference), or it is handed to a person who needs cash and
-- sends the same amount to the clinic's account (via = 'person', their name
-- and the transfer's UTR).
CREATE TABLE IF NOT EXISTS "cash_deposit" (
  "id" text PRIMARY KEY NOT NULL,
  "clinic_id" text NOT NULL REFERENCES "clinic"("id") ON DELETE cascade,
  "deposited_on" date NOT NULL,
  "amount_in_paise" integer NOT NULL,
  "via" text NOT NULL,
  "person_name" text,
  "reference" text,
  "note" text,
  "voided_at" timestamp,
  "void_reason" text,
  "voided_by_user_id" text REFERENCES "user"("id") ON DELETE set null,
  "created_by_user_id" text REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_deposit_clinic_day_idx" ON "cash_deposit" ("clinic_id", "deposited_on");
