import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationConversation, contact } from "@workspace/db/schema";
import { and, eq, desc, ilike, or, sql, type SQL } from "@workspace/db";
import { requireOperations } from "@/src/lib/auth/guards";

const PAGE_SIZES = [20, 50, 100, 200];

/**
 * The inbox list, one page at a time.
 *
 * ?page=1&pageSize=50&q=…&unread=1
 *
 * Paged on the server because a broadcast leaves a conversation behind for
 * every number it reached — nineteen thousand rows, each with its preview and
 * unread state worked out, is more than the page could ever show and enough to
 * stop it showing anything. Search and the Unread filter run here too, so they
 * cover every conversation rather than only the page on screen.
 */
export async function GET(req: Request) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const requestedSize = Number(url.searchParams.get("pageSize"));
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 50;
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const q = (url.searchParams.get("q") ?? "").trim();
  const onlyUnread = url.searchParams.get("unread") === "1";
  // replied=1: only threads the person has written in, the latest reply first.
  const onlyReplied = !onlyUnread && url.searchParams.get("replied") === "1";

  // The newest message of each thread, for the one-line preview in the list.
  const last = sql`(
    select m.body from communication_message m
    where m.conversation_id = ${communicationConversation.id}
    order by m.created_at desc limit 1
  )`;
  const lastDirection = sql`(
    select m.direction from communication_message m
    where m.conversation_id = ${communicationConversation.id}
    order by m.created_at desc limit 1
  )`;
  // Same rule as the Inbox badge (api/conversations/unread).
  const unread = sql<boolean>`exists (
    select 1 from communication_message m
    where m.conversation_id = ${communicationConversation.id}
      and m.direction = 'inbound'
      and m.created_at > coalesce(${communicationConversation.lastReadAt}, ${communicationConversation.createdAt} - interval '1 minute')
  )`;
  // WhatsApp's customer-care window opens on their last message and runs 24
  // hours. Our own replies do not extend it.
  const lastInboundAt = sql<Date | null>`(
    select max(m.created_at) from communication_message m
    where m.conversation_id = ${communicationConversation.id}
      and m.direction = 'inbound'
  )`;

  const filters: SQL[] = [];
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    // Numbers are stored as +91…; "98765", "+91 98765" and "0987…" all find it.
    const digits = q.replace(/\D/g, "").replace(/^0+/, "");
    const match = [ilike(contact.name, like), ilike(contact.email, like)];
    if (digits.length >= 3) match.push(ilike(contact.phone, `%${digits}%`));
    filters.push(or(...match)!);
  }
  if (onlyUnread) filters.push(unread);
  // Somebody wrote back — anything at all, a word or a button tap.
  if (onlyReplied) filters.push(sql`${lastInboundAt} is not null`);
  const where = filters.length ? and(...filters) : undefined;

  const [counted, unreadCounted] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(communicationConversation)
      .innerJoin(contact, eq(communicationConversation.contactId, contact.id))
      .where(where),
    // For the Unread button's badge — every unread thread, whatever the search.
    db.select({ n: sql<number>`count(*)::int` }).from(communicationConversation).where(unread),
  ]);
  const total = counted[0]?.n ?? 0;
  const unreadTotal = unreadCounted[0]?.n ?? 0;

  const rows = await db
    .select({
      id: communicationConversation.id,
      channel: communicationConversation.channel,
      status: communicationConversation.status,
      lastMessageAt: communicationConversation.lastMessageAt,
      lastBody: sql<string | null>`${last}`,
      lastDirection: sql<string | null>`${lastDirection}`,
      unread,
      lastInboundAt,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      contactEmail: contact.email,
    })
    .from(communicationConversation)
    .innerJoin(contact, eq(communicationConversation.contactId, contact.id))
    .where(where)
    .orderBy(
      // "Replied" lists by their last reply, so a reply to a broadcast an
      // hour ago sits above a thread we messaged a minute ago.
      onlyReplied
        ? sql`${lastInboundAt} desc nulls last`
        : sql`${communicationConversation.lastMessageAt} desc nulls last`,
      desc(communicationConversation.createdAt),
      desc(communicationConversation.id),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ conversations: rows, total, unreadTotal, page, pageSize });
}
