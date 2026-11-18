import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationConversation, communicationTemplate, contact, mediaAsset } from "@workspace/db/schema";
import { and, eq } from "@workspace/db";
import { sendCommunication } from "@workspace/communication";
import { requireClinicAnyPermission } from "@/src/lib/auth/clinic";
import { OPS_KEYS } from "@workspace/db/permissions";
import { normalizePhone } from "@/src/lib/normalize-phone";
import { markAsLead } from "@workspace/db/lead-promotion";
import { routeLead } from "@workspace/db/lead-routing";

// Starts a conversation with a number that may not be in the CRM yet — the
// "New message" action on the conversations list. Everything downstream
// (consent check, message log, delivery status) is sendCommunication's job;
// this route only resolves a phone number to a contact first, because a
// conversation cannot exist without one.
export async function POST(req: Request) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;
  const clinicId = context.clinic.id;

  const body = await req.json().catch(() => null);
  const templateKey = typeof body?.templateKey === "string" ? body.templateKey : "";
  const rawName = typeof body?.name === "string" ? body.name.trim() : "";
  // "Add to Leads" on the New message form: staff returning a call from
  // someone who enquired by phone. Otherwise a new number is AUDIENCE.
  const asLead = body?.asLead === true;
  const variables =
    body?.variables && typeof body.variables === "object" ? (body.variables as Record<string, unknown>) : {};
  // Values for link buttons that end in a variable (e.g. a sign-in link).
  const buttonParameters = Array.isArray(body?.buttonParameters)
    ? (body.buttonParameters as unknown[]).map((v) => String(v ?? "").trim())
    : undefined;
  // Sent from an open chat: that exact contact, not whoever else shares the
  // number at another clinic.
  const contactId = typeof body?.contactId === "string" ? body.contactId : "";
  // A different photo/video/PDF for a media-header template, picked from the
  // Media library — only a file that is in the library, never any URL.
  const headerMediaUrl = typeof body?.headerMediaUrl === "string" ? body.headerMediaUrl : "";
  if (headerMediaUrl) {
    const [asset] = await db.select({ id: mediaAsset.id }).from(mediaAsset).where(eq(mediaAsset.url, headerMediaUrl)).limit(1);
    if (!asset) return NextResponse.json({ error: "That file is not in the Media library" }, { status: 400 });
  }

  if (!templateKey) {
    return NextResponse.json({ error: "Pick a template to send" }, { status: 400 });
  }

  const fromChat = contactId
    ? (await db.select().from(contact).where(eq(contact.id, contactId)).limit(1))[0]
    : undefined;
  // Another clinic's chat is not one this console can write into. Null is a
  // contact from before clinics, which every clinic still reaches.
  if (contactId && (!fromChat || (fromChat.clinicId && fromChat.clinicId !== clinicId))) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const phone = normalizePhone(typeof body?.phone === "string" ? body.phone : fromChat?.phone ?? "");
  if (!phone.ok) return NextResponse.json({ error: phone.error }, { status: 400 });

  const [template] = await db
    .select()
    .from(communicationTemplate)
    .where(eq(communicationTemplate.key, templateKey))
    .limit(1);
  if (!template) {
    return NextResponse.json({ error: `Unknown template "${templateKey}"` }, { status: 400 });
  }
  // A template that Meta has not approved cannot open a conversation, and the
  // Graph API failure for it is opaque — say so here instead.
  if (template.channel === "whatsapp" && template.submissionStatus !== "approved") {
    return NextResponse.json(
      { error: `"${template.name}" is ${template.submissionStatus}, not approved by WhatsApp yet` },
      { status: 400 },
    );
  }

  let [contactRow] = fromChat
    ? [fromChat]
    : await db.select().from(contact).where(eq(contact.phone, phone.phone)).limit(1);

  // The number is one person, and that person may already be another
  // clinic's. Messaging them from here would put this clinic's template into
  // a conversation it cannot see.
  if (contactRow?.clinicId && contactRow.clinicId !== clinicId) {
    return NextResponse.json({ error: "This number belongs to a patient at another clinic." }, { status: 409 });
  }

  if (!contactRow) {
    [contactRow] = await db
      .insert(contact)
      .values({
        clinicId,
        name: rawName || null,
        phone: phone.phone,
        stage: "AUDIENCE",
        source: "MANUAL",
        firstTouchAt: new Date(),
      })
      .returning();
  } else if (rawName && !contactRow.name) {
    // Fill in a name we didn't have; never overwrite one that's already set.
    [contactRow] = await db
      .update(contact)
      .set({ name: rawName, updatedAt: new Date() })
      .where(eq(contact.id, contactRow.id))
      .returning();
  }

  // Routed to an owner like any lead, but without LEAD_CAPTURED: staff are
  // messaging them right now, and the new-lead flow would send a second
  // "welcome" on top of this one.
  if (asLead && (await markAsLead(db, contactRow!.id, { source: "MANUAL" }, "added to leads by staff"))) {
    await routeLead(db, contactRow!.id, {});
  }

  try {
    const result = await sendCommunication({
      contactId: contactRow!.id,
      templateKey,
      variables,
      buttonParameters,
      headerMediaUrl: headerMediaUrl || undefined,
      sentBy: session.user.id,
    });

    const [conversation] = await db
      .select({ id: communicationConversation.id })
      .from(communicationConversation)
      .where(
        and(
          eq(communicationConversation.contactId, contactRow!.id),
          eq(communicationConversation.channel, template.channel),
        ),
      )
      .limit(1);

    return NextResponse.json({
      ...result,
      conversationId: conversation?.id ?? null,
      contactId: contactRow!.id,
      phone: phone.phone,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send message" },
      { status: 500 },
    );
  }
}
