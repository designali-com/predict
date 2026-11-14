import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationMessage, communicationConversation, contact } from "@workspace/db/schema";
import { eq, asc } from "@workspace/db";
import { sendTextMessage } from "@workspace/communication";
import { requireOperations } from "@/src/lib/auth/guards";
import { withMessageMedia } from "@/src/lib/message-media";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [conversation] = await db
    .select({
      id: communicationConversation.id,
      channel: communicationConversation.channel,
      status: communicationConversation.status,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      contactEmail: contact.email,
    })
    .from(communicationConversation)
    .innerJoin(contact, eq(communicationConversation.contactId, contact.id))
    .where(eq(communicationConversation.id, id))
    .limit(1);

  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Opening the thread reads it: clears it from the Inbox badge.
  await db
    .update(communicationConversation)
    .set({ lastReadAt: new Date() })
    .where(eq(communicationConversation.id, id));

  const messages = await db
    .select()
    .from(communicationMessage)
    .where(eq(communicationMessage.conversationId, id))
    .orderBy(asc(communicationMessage.createdAt));

  // Photos, videos, voice notes and documents, with links the browser can open.
  return NextResponse.json({ conversation, messages: await withMessageMedia(messages) });
}

// Free-form reply typed by staff in the conversation view. Unlike a template
// send this only reaches the patient inside WhatsApp's 24-hour customer
// service window (i.e. after they message the business); outside it Meta
// rejects the call and the row is logged as failed with that reason.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const payload = await req.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (!body) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  // WhatsApp's own cap on a text message body.
  if (body.length > 4096) {
    return NextResponse.json({ error: "Message is longer than 4096 characters" }, { status: 400 });
  }

  const [conversation] = await db
    .select()
    .from(communicationConversation)
    .where(eq(communicationConversation.id, id))
    .limit(1);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conversation.channel !== "whatsapp") {
    return NextResponse.json(
      { error: `Free-form replies are only supported on whatsapp, not ${conversation.channel}` },
      { status: 400 },
    );
  }

  try {
    const result = await sendTextMessage({
      contactId: conversation.contactId,
      body,
      sentBy: session.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send message" },
      { status: 500 },
    );
  }
}
