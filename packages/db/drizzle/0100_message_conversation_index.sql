-- The inbox asks four things of every thread it lists: the newest message
-- (preview + its direction), whether anything of theirs is unread, and when
-- they last wrote (the 24h window, and the "Replied" view's order). With no
-- index on conversation_id each of those read all of communication_message,
-- once per thread — after the broadcasts, ~10k threads x ~18k messages, and
-- the Replied view ran past a minute and never came back.
--
-- CONCURRENTLY: built without locking the table, so sends and the webhook
-- keep writing while it builds. (Run outside a transaction.)

CREATE INDEX CONCURRENTLY IF NOT EXISTS "communication_message_conversation_direction_created_idx"
  ON "communication_message" ("conversation_id", "direction", "created_at");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "communication_message_conversation_created_idx"
  ON "communication_message" ("conversation_id", "created_at");

-- Reports → WhatsApp automation reads a flow run's messages (run_id) and a
-- person's replies (contact_id, inbound, after a time).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "communication_message_run_idx"
  ON "communication_message" ("run_id") WHERE "run_id" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "communication_message_contact_direction_created_idx"
  ON "communication_message" ("contact_id", "direction", "created_at");
