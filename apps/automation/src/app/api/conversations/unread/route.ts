import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { sql } from "@workspace/db";
import { requireOperations } from "@/src/lib/auth/guards";

/**
 * The Inbox badge: how many conversations have a message nobody has opened,
 * and the newest such message — the sidebar compares its id with the last one
 * it saw to know when to pop a "new message" toast.
 *
 * A conversation never opened counts from when it was created, so a history
 * backfill of old chats does not light the badge up.
 */
export async function GET() {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const unreadSince = sql`coalesce(c.last_read_at, c.created_at - interval '1 minute')`;

  const [countRows, latestRows] = await Promise.all([
    db.execute(sql`
      select count(*)::int as count
      from communication_conversation c
      where exists (
        select 1 from communication_message m
        where m.conversation_id = c.id and m.direction = 'inbound' and m.created_at > ${unreadSince}
      )`),
    db.execute(sql`
      select m.id, m.conversation_id as "conversationId", m.body, m.created_at as "createdAt",
             coalesce(nullif(k.name, ''), k.phone) as "from"
      from communication_message m
      join communication_conversation c on c.id = m.conversation_id
      join contact k on k.id = m.contact_id
      where m.direction = 'inbound' and m.created_at > ${unreadSince}
      order by m.created_at desc
      limit 1`),
  ]);

  return NextResponse.json({
    count: (countRows.rows[0] as { count: number } | undefined)?.count ?? 0,
    latest: latestRows.rows[0] ?? null,
  });
}
