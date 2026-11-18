-- Inbox unread count: when staff last opened a conversation. A conversation
-- is unread when an inbound message arrived after this (see
-- apps/automation/src/lib/inbox-unread.ts).

ALTER TABLE "communication_conversation" ADD COLUMN IF NOT EXISTS "last_read_at" timestamp;
--> statement-breakpoint
-- Start from a clean slate, except people who wrote in the last 7 days and
-- have not been answered: those stay unread.
UPDATE "communication_conversation" c SET "last_read_at" = now()
WHERE c."last_read_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "communication_message" m
    WHERE m."conversation_id" = c."id"
      AND m."direction" = 'inbound'
      AND m."created_at" > now() - interval '7 days'
      AND m."created_at" > coalesce((
        SELECT max(o."created_at") FROM "communication_message" o
        WHERE o."conversation_id" = c."id" AND o."direction" = 'outbound'
      ), 'epoch'::timestamp)
  );
