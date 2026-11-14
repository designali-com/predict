import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { campaign, campaignRecipient, communicationTemplate, contact } from "@workspace/db/schema";
import { desc, eq, sql } from "@workspace/db";
import { normalizePhone } from "@workspace/db/normalize-phone";
import { ContactStage } from "@workspace/db/contact-stage";
import { requirePermission } from "@/src/lib/auth/guards";

export async function GET() {
  const session = await requirePermission("ops.campaigns");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      createdAt: campaign.createdAt,
      templateName: communicationTemplate.name,
      total: sql<number>`count(${campaignRecipient.id})::int`,
      sent: sql<number>`count(*) filter (where ${campaignRecipient.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${campaignRecipient.status} = 'failed')::int`,
      pending: sql<number>`count(*) filter (where ${campaignRecipient.status} = 'pending')::int`,
    })
    .from(campaign)
    .leftJoin(communicationTemplate, eq(communicationTemplate.id, campaign.templateId))
    .leftJoin(campaignRecipient, eq(campaignRecipient.campaignId, campaign.id))
    .groupBy(campaign.id, communicationTemplate.name)
    .orderBy(desc(campaign.createdAt));

  return NextResponse.json({ campaigns: rows });
}

interface UploadedRow {
  phone?: unknown;
  name?: unknown;
}

/**
 * Create a campaign from an uploaded list.
 *
 * The numbers are normalised and de-duplicated here rather than at send time,
 * so the count shown before sending is the count that will actually be
 * messaged. A spreadsheet of 900 rows routinely contains the same person
 * twice and a dozen numbers that are not numbers.
 */
export async function POST(req: Request) {
  const session = await requirePermission("ops.campaigns");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const templateId = typeof body?.templateId === "string" ? body.templateId : "";
  const rows: UploadedRow[] = Array.isArray(body?.rows) ? body.rows : [];
  const variables = body?.variables ?? {};

  if (!name) return NextResponse.json({ error: "Give the campaign a name" }, { status: 400 });
  if (!templateId) return NextResponse.json({ error: "Pick a template" }, { status: 400 });
  if (!rows.length) return NextResponse.json({ error: "The list is empty" }, { status: 400 });

  const [template] = await db
    .select()
    .from(communicationTemplate)
    .where(eq(communicationTemplate.id, templateId))
    .limit(1);

  if (!template) return NextResponse.json({ error: "No such template" }, { status: 404 });

  // Sending on a template Meta has not approved fails per-message with an
  // opaque error, after the campaign has already started. Refuse up front —
  // except one still in review: the list can be loaded and the send scheduled
  // meanwhile, and the worker holds a scheduled send until Meta approves.
  if (
    template.channel === "whatsapp" &&
    template.submissionStatus !== "approved" &&
    template.submissionStatus !== "pending"
  ) {
    return NextResponse.json(
      {
        error: `"${template.name}" is ${template.submissionStatus}, not approved. WhatsApp will reject every message until Meta approves it.`,
      },
      { status: 400 },
    );
  }

  const seen = new Set<string>();
  const valid: { phone: string; name: string | null }[] = [];
  let invalid = 0;
  let duplicates = 0;

  for (const row of rows) {
    const raw = typeof row?.phone === "string" || typeof row?.phone === "number" ? String(row.phone) : "";
    const normalized = normalizePhone(raw);
    if (!normalized.ok) {
      invalid++;
      continue;
    }
    if (seen.has(normalized.phone)) {
      duplicates++;
      continue;
    }
    seen.add(normalized.phone);
    valid.push({
      phone: normalized.phone,
      name: typeof row?.name === "string" && row.name.trim() ? row.name.trim() : null,
    });
  }

  if (!valid.length) {
    return NextResponse.json(
      { error: `None of the ${rows.length} rows had a usable phone number` },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(campaign)
    .values({ name, templateId, variables, createdByUserId: session.user.id })
    .returning();

  // Chunked because Postgres has a parameter limit per statement and a
  // thousand-row insert would exceed it.
  for (let i = 0; i < valid.length; i += 200) {
    await db
      .insert(campaignRecipient)
      .values(valid.slice(i, i + 200).map((r) => ({ campaignId: created!.id, ...r })))
      .onConflictDoNothing();
  }

  return NextResponse.json(
    { id: created!.id, accepted: valid.length, invalid, duplicates },
    { status: 201 },
  );
}
