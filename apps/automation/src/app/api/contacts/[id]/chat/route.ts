import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  contact,
  communicationConversation,
  communicationMessage,
  aiConversation,
  aiMessage,
} from "@workspace/db/schema";
import { eq, and, asc, desc, inArray } from "@workspace/db";
import { requireOperations } from "@/src/lib/auth/guards";
import { withMessageMedia } from "@/src/lib/message-media";

// Meta's customer-service window. Free-form text only reaches the contact
// within 24 hours of *their* last inbound message; outside it the send is
// rejected and logged as failed. The agent needs to know which side of that
// line they are on before typing, not after.
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Both sides of "what has this person said to us": the WhatsApp thread the
 * support team writes into, and the separate conversation they had with the
 * patient-facing AI assistant. Those live in unrelated tables and are keyed
 * differently (contactId vs userId), but to an agent on a call they are one
 * history, so they are returned together.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [contactRow] = await db.select().from(contact).where(eq(contact.id, id)).limit(1);
  if (!contactRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [conversation] = await db
    .select()
    .from(communicationConversation)
    .where(
      and(
        eq(communicationConversation.contactId, id),
        eq(communicationConversation.channel, "whatsapp"),
      ),
    )
    .limit(1);

  const messages = conversation
    ? await db
        .select()
        .from(communicationMessage)
        .where(eq(communicationMessage.conversationId, conversation.id))
        .orderBy(asc(communicationMessage.createdAt))
    : [];

  // Computed from the last *inbound* message, not the last message overall —
  // our own outbound sends do not reopen the window.
  const lastInboundAt = messages.reduce<Date | null>((latest, m) => {
    if (m.direction !== "inbound") return latest;
    const at = new Date(m.createdAt);
    return !latest || at > latest ? at : latest;
  }, null);
  const sessionOpen = lastInboundAt
    ? Date.now() - lastInboundAt.getTime() < SESSION_WINDOW_MS
    : false;

  let aiThreads: { id: string; title: string | null; createdAt: Date; messages: unknown[] }[] = [];
  if (contactRow.userId) {
    const threads = await db
      .select()
      .from(aiConversation)
      .where(eq(aiConversation.userId, contactRow.userId))
      .orderBy(desc(aiConversation.updatedAt))
      .limit(10);

    const rows = threads.length
      ? await db
          .select()
          .from(aiMessage)
          .where(
            inArray(
              aiMessage.conversationId,
              threads.map((t) => t.id),
            ),
          )
          .orderBy(asc(aiMessage.createdAt))
      : [];

    aiThreads = threads.map((t) => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt,
      messages: rows.filter((m) => m.conversationId === t.id),
    }));
  }

  return NextResponse.json({
    conversationId: conversation?.id ?? null,
    messages: await withMessageMedia(messages),
    sessionOpen,
    lastInboundAt,
    aiThreads,
  });
}
