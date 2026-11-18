-- Schema clarity pass. Renames rather than drop+create, so every row is kept.
-- Hand-authored: drizzle-kit cannot tell a rename from a drop+create without
-- an interactive prompt, and guessing wrong here would delete live data.
--
-- Not touched: rsvp_responses. It lives in this database but belongs to a
-- different project and is not in schema.ts.

--> statement-breakpoint
-- "domain" meant two unrelated things: a cluster of biomarkers, and a
-- business lifecycle event. The biomarker meaning keeps the word.
ALTER TABLE "domain_event" RENAME TO "lifecycle_event";--> statement-breakpoint
ALTER TABLE "automation_flow_run" RENAME COLUMN "domain_event_id" TO "lifecycle_event_id";--> statement-breakpoint
ALTER TABLE "automation_trigger_execution" RENAME COLUMN "domain_event_id" TO "lifecycle_event_id";--> statement-breakpoint
ALTER INDEX IF EXISTS "domain_event_idempotency_key_unique" RENAME TO "lifecycle_event_idempotency_key_unique";--> statement-breakpoint

-- Singular, like every other table, and "record" marks it as the clinical
-- chart against contact's CRM row.
ALTER TABLE "patients" RENAME TO "patient_record";--> statement-breakpoint
ALTER TABLE "patient_addresses" RENAME TO "patient_address";--> statement-breakpoint

-- It was never a category: it is a composite index (CBLAI) carrying the
-- delta-age scaling constant and the risk bands.
ALTER TABLE "biomarker_category" RENAME TO "biomarker_index";--> statement-breakpoint
ALTER TABLE "category_domain_map" RENAME TO "index_domain_map";--> statement-breakpoint
ALTER TABLE "index_domain_map" RENAME COLUMN "category_id" TO "index_id";--> statement-breakpoint
ALTER TABLE "biological_age_result" RENAME COLUMN "category_id" TO "index_id";--> statement-breakpoint

-- Stores medication/exercise/diet adherence, nothing about ability.
ALTER TABLE "ability_log" RENAME TO "adherence_log";--> statement-breakpoint

-- "Template" already meant a Meta-approved WhatsApp message template.
ALTER TABLE "doctor_slot_template" RENAME TO "doctor_availability";--> statement-breakpoint

-- Dead tables: zero rows, and no query anywhere read or wrote them.
-- patient_profile and address were superseded by patient_record and
-- patient_address; communication_channel_config was never wired up
-- (provider credentials are read from env vars, never stored in the DB).
DROP TABLE IF EXISTS "patient_profile";--> statement-breakpoint
DROP TABLE IF EXISTS "address";--> statement-breakpoint
DROP TABLE IF EXISTS "communication_channel_config";
