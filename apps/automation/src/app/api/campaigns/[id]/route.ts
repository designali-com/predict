import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  campaign,
  campaignRecipient,
  communicationMessage,
  communicationTemplate,
} from "@workspace/db/schema";
import { asc, eq, sql } from "@workspace/db";
import { requirePermission } from "@/src/lib/auth/guards";

/**
 * One campaign and how it went.
 *
 * Delivery state is read from the message rows, not copied onto the recipient:
 * the status webhook updates messages, so a copy here would be a second answer
 * that drifts. "sent" on a recipient means we handed it to Meta; whether it
 * arrived is the message's status.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.campaigns");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [row] = await db
    .select({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      scheduledAt: campaign.scheduledAt,
      retriedAt: campaign.retriedAt,
      createdAt: campaign.createdAt,
      templateId: communicationTemplate.id,
      templateName: communicationTemplate.name,
      templateKey: communicationTemplate.key,
      templateStatus: communicationTemplate.submissionStatus,
    })
    .from(campaign)
    .leftJoin(communicationTemplate, eq(communicationTemplate.id, campaign.templateId))
    .where(eq(campaign.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${campaignRecipient.status} = 'pending')::int`,
      sent: sql<number>`count(*) filter (where ${campaignRecipient.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${campaignRecipient.status} = 'failed')::int`,
      skipped: sql<number>`count(*) filter (where ${campaignRecipient.status} = 'skipped')::int`,
    })
    .from(campaignRecipient)
    .where(eq(campaignRecipient.campaignId, id));

  const [delivery] = await db
    .select({
      delivered: sql<number>`count(*) filter (where ${communicationMessage.status} = 'delivered')::int`,
      read: sql<number>`count(*) filter (where ${communicationMessage.status} = 'read')::int`,
      undelivered: sql<number>`count(*) filter (where ${communicationMessage.status} = 'failed')::int`,
    })
    .from(campaignRecipient)
    .innerJoin(communicationMessage, eq(communicationMessage.id, campaignRecipient.messageId))
    .where(eq(campaignRecipient.campaignId, id));

  const recipients = await db
    .select({
      id: campaignRecipient.id,
      phone: campaignRecipient.phone,
      name: campaignRecipient.name,
      status: campaignRecipient.status,
      error: campaignRecipient.error,
      contactId: campaignRecipient.contactId,
      deliveryStatus: communicationMessage.status,
      updatedAt: campaignRecipient.updatedAt,
    })
    .from(campaignRecipient)
    .leftJoin(communicationMessage, eq(communicationMessage.id, campaignRecipient.messageId))
    .where(eq(campaignRecipient.campaignId, id))
    .orderBy(asc(campaignRecipient.createdAt))
    .limit(1000);

  return NextResponse.json({
    campaign: row,
    counts: { ...counts, ...delivery },
    recipients,
  });
}

/**
 * Schedule, start, pause or resume a campaign — all of which hand the sending
 * to the automation worker (see src/campaign-send.ts), so nobody has to keep
 * this page open while nineteen thousand messages go out.
 *
 *   { action: "schedule", at: ISO }  send at that time
 *   { action: "send_now" }           send from the server right away
 *   { action: "pause" }              stop after the batch in flight
 *   { action: "resume" }             carry on with whoever is still pending
 *   { action: "unschedule" }         back to a draft
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.campaigns");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: string; at?: string } | null;

  const [row] = await db
    .select({ status: campaign.status, templateStatus: communicationTemplate.submissionStatus, templateName: communicationTemplate.name })
    .from(campaign)
    .innerJoin(communicationTemplate, eq(communicationTemplate.id, campaign.templateId))
    .where(eq(campaign.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status === "completed") return NextResponse.json({ error: "This campaign has already gone out." }, { status: 400 });

  const now = new Date();
  let set: { status: string; scheduledAt?: Date | null };

  switch (body?.action) {
    case "schedule": {
      const at = body.at ? new Date(body.at) : null;
      if (!at || Number.isNaN(at.getTime())) return NextResponse.json({ error: "Pick a date and time." }, { status: 400 });
      if (at.getTime() < now.getTime() - 60_000) return NextResponse.json({ error: "That time has already passed." }, { status: 400 });
      set = { status: "scheduled", scheduledAt: at };
      break;
    }
    case "send_now":
    case "resume":
      set = { status: "scheduled", scheduledAt: now };
      break;
    case "pause":
      set = { status: "paused" };
      break;
    case "unschedule":
      set = { status: "draft", scheduledAt: null };
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Meta rejects every message on a template it has not approved; better to
  // refuse now than to burn through the list collecting failures.
  if (set.status === "scheduled" && row.templateStatus !== "approved" && body?.action !== "schedule") {
    return NextResponse.json(
      { error: `"${row.templateName}" is ${row.templateStatus}, not approved — WhatsApp will reject every message.` },
      { status: 400 },
    );
  }

  await db.update(campaign).set({ ...set, updatedAt: now }).where(eq(campaign.id, id));
  return NextResponse.json({ ok: true, ...set });
}
