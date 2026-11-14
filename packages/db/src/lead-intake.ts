import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import { contact, leadSubmission } from "./schema";
import type * as schema from "./schema";
import { normalizePhone } from "./normalize-phone";
import { ContactStage } from "./contact-stage";
import { emitDomainEvent } from "./emit-domain-event";
import { DomainEventType } from "./domain-events";
import { routeLead } from "./lead-routing";
import { locationFromAnswers } from "./india-geo";
import { announceNewLead, markAsLead } from "./lead-promotion";

type Db = NodePgDatabase<typeof schema>;

export type LeadProvider = "meta" | "google" | "website";

/**
 * One lead form submission, already mapped out of whatever shape its provider
 * sends. Every intake path (Meta webhook, Google webhook, website form, Meta
 * backfill) funnels through ingestLead() so dedupe and attribution are decided
 * in exactly one place.
 */
export interface LeadInput {
  provider: LeadProvider;
  /** The provider's own id for this submission (Meta leadgen_id, Google lead_id). */
  externalId: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  /** City as the person gave it, when the form asked. Used for routing. */
  city?: string | null;
  /** Every answer on the form, label -> value, custom questions included. */
  answers?: Record<string, string>;
  formId?: string | null;
  formName?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  adsetId?: string | null;
  adsetName?: string | null;
  adId?: string | null;
  adName?: string | null;
  /** FACEBOOK | INSTAGRAM | GOOGLE | WEBSITE ... */
  platform?: string | null;
  pageId?: string | null;
  raw?: unknown;
  isTest?: boolean;
  isOrganic?: boolean;
  submittedAt?: Date | null;
  /** contact.source for a contact this lead creates, e.g. SOCIAL_MEDIA | GOOGLE_ADS | WEBSITE. */
  source: string;
  /** Click id (gclid / fbclid) — stored as contact.referralCode on a new contact. */
  clickId?: string | null;
}

export type IngestResult =
  | { status: "created" | "existing"; contactId: string; submissionId: string }
  | { status: "duplicate"; contactId: string | null; submissionId: string }
  | { status: "unmatched"; submissionId: string; reason: string };

/**
 * Records a lead submission and makes sure there is a contact behind it.
 *
 *  - The same submission delivered twice (webhook retry, backfill overlap) is
 *    a no-op: nothing is written and no event fires, so nobody is messaged twice.
 *  - A person is matched on phone first, then email. Someone who fills in a
 *    second form stays one contact; the answers they gave are added as a
 *    second submission.
 *  - LEAD_CAPTURED fires only when this created the contact — the same event
 *    a Click-to-WhatsApp lead fires, so one nurture flow covers both.
 *    LEAD_FORM_SUBMITTED fires for every new submission, for flows that should
 *    react to a returning person too.
 */
export async function ingestLead(db: Db, input: LeadInput): Promise<IngestResult> {
  const phoneResult = input.phone ? normalizePhone(input.phone) : null;
  const phone = phoneResult?.ok ? phoneResult.phone : null;
  const email = cleanEmail(input.email);
  const name = input.name?.trim() || null;
  const answers = input.answers ?? {};

  const [prior] = await db
    .select()
    .from(leadSubmission)
    .where(and(eq(leadSubmission.provider, input.provider), eq(leadSubmission.externalId, input.externalId)))
    .limit(1);
  // A row that already has a contact is a finished submission. A row without
  // one is a placeholder from a webhook whose lead could not be fetched at the
  // time — completing it is exactly what a retry is for.
  if (prior?.contactId) {
    return { status: "duplicate", contactId: prior.contactId, submissionId: prior.id };
  }

  const submissionValues = {
    provider: input.provider,
    externalId: input.externalId,
    formId: input.formId ?? null,
    formName: input.formName ?? null,
    campaignId: input.campaignId ?? null,
    campaignName: input.campaignName ?? null,
    adsetId: input.adsetId ?? null,
    adsetName: input.adsetName ?? null,
    adId: input.adId ?? null,
    adName: input.adName ?? null,
    platform: input.platform ?? null,
    pageId: input.pageId ?? null,
    answers,
    raw: input.raw ?? null,
    isTest: input.isTest ?? false,
    isOrganic: input.isOrganic ?? false,
    submittedAt: input.submittedAt ?? null,
  };

  if (!phone && !email) {
    // Nobody to contact. Kept rather than dropped, so a form that is quietly
    // missing its phone question shows up as a pile of unmatched rows instead
    // of as leads that simply never arrived.
    const reason = input.phone ? `unusable phone "${input.phone}"` : "no phone or email on the form";
    const id = await saveSubmission(db, prior?.id, { ...submissionValues, contactId: null, fetchError: reason });
    return { status: "unmatched", submissionId: id, reason };
  }

  const { contactId, created } = await findOrCreateContact(db, { phone, email, name, input });

  // Someone we had only ever broadcast to has now enquired: from here on they
  // are a lead exactly like a brand-new one, attributed to this form.
  const promoted =
    !created &&
    (await markAsLead(
      db,
      contactId,
      {
        source: input.source,
        sourcePlatform: input.platform ?? null,
        campaign: input.campaignName ?? input.formName ?? null,
        campaignId: input.campaignId ?? null,
        referralCode: input.clickId ?? null,
      },
      `${input.provider} lead form`,
    ));

  // Owner and interest are decided before any event fires, so the flow that
  // LEAD_CAPTURED starts already knows it is a knee-pain lead in Delhi.
  const where = locationFromAnswers(answers);
  const routing = await routeLead(db, contactId, {
    city: input.city ?? where.city,
    state: where.state,
    pincode: where.pincode,
    adsetName: input.adsetName,
    campaignName: input.campaignName,
    adName: input.adName,
    adId: input.adId,
    formName: input.formName,
    source: input.source,
    platform: input.platform,
    answers,
  });

  let submissionId: string;
  try {
    submissionId = await saveSubmission(db, prior?.id, {
      ...submissionValues,
      contactId,
      clinicId: routing.clinicId,
      fetchError: null,
    });
  } catch (err) {
    // Two deliveries of the same lead racing on the unique index. The other
    // one owns it — including the events — so this one stops here.
    if (isUniqueViolation(err)) {
      const [winner] = await db
        .select({ id: leadSubmission.id })
        .from(leadSubmission)
        .where(and(eq(leadSubmission.provider, input.provider), eq(leadSubmission.externalId, input.externalId)))
        .limit(1);
      return { status: "duplicate", contactId, submissionId: winner?.id ?? "" };
    }
    throw err;
  }

  // Everything a flow's templates might want, flat, so a Send Communication
  // node can map "name" or "formName" straight off the trigger context.
  const payload = {
    contactId,
    submissionId,
    source: input.source,
    provider: input.provider,
    name: name ?? "",
    firstName: (name ?? "").split(/\s+/)[0] ?? "",
    phone: phone ?? "",
    email: email ?? "",
    formName: input.formName ?? "",
    campaignName: input.campaignName ?? "",
    adName: input.adName ?? "",
    platform: input.platform ?? "",
    adsetName: input.adsetName ?? "",
    interest: routing.interest ?? "",
    city: routing.city ?? "",
    clinicId: routing.clinicId ?? "",
    assignedUserId: routing.assignedUserId ?? "",
    assignedUserName: routing.assignedUserName ?? "",
    assignedRole: routing.assignedRole ?? "",
    isTest: input.isTest ?? false,
    answers,
  };

  if (created || promoted) {
    // One announcement per person across every entry point (WhatsApp, form,
    // staff promotion): somebody who messages us and then fills a form is one
    // new lead, and must not start the nurture flow twice.
    await announceNewLead(db, contactId, payload);
  }
  await emitDomainEvent(db, DomainEventType.LEAD_FORM_SUBMITTED, payload, {
    contactId,
    idempotencyKey: `lead_form_submitted:${input.provider}:${input.externalId}`,
  });

  return { status: created || promoted ? "created" : "existing", contactId, submissionId };
}

/**
 * A webhook arrived but the lead behind it could not be read yet (Meta sends
 * only an id). Stores what is known so `sync:meta-leads` can finish it later.
 * Does nothing if the submission is already recorded.
 */
export async function recordPendingLead(
  db: Db,
  input: Pick<LeadInput, "provider" | "externalId" | "formId" | "adId" | "pageId" | "raw" | "submittedAt">,
  error: string,
): Promise<void> {
  await db
    .insert(leadSubmission)
    .values({
      provider: input.provider,
      externalId: input.externalId,
      formId: input.formId ?? null,
      adId: input.adId ?? null,
      pageId: input.pageId ?? null,
      raw: input.raw ?? null,
      submittedAt: input.submittedAt ?? null,
      fetchError: error,
    })
    .onConflictDoUpdate({
      target: [leadSubmission.provider, leadSubmission.externalId],
      set: { fetchError: error },
      // Never downgrade a finished submission back to "pending".
      setWhere: isNull(leadSubmission.contactId),
    });
}

/** Submissions still waiting on a fetch — what the backfill retries. */
export async function pendingLeadSubmissions(db: Db, provider: LeadProvider) {
  return db
    .select()
    .from(leadSubmission)
    .where(and(eq(leadSubmission.provider, provider), isNull(leadSubmission.contactId)));
}

async function saveSubmission(
  db: Db,
  priorId: string | undefined,
  values: typeof leadSubmission.$inferInsert,
): Promise<string> {
  if (priorId) {
    await db.update(leadSubmission).set(values).where(eq(leadSubmission.id, priorId));
    return priorId;
  }
  const [row] = await db.insert(leadSubmission).values(values).returning({ id: leadSubmission.id });
  return row!.id;
}

async function findOrCreateContact(
  db: Db,
  args: { phone: string | null; email: string | null; name: string | null; input: LeadInput },
): Promise<{ contactId: string; created: boolean }> {
  const { phone, email, name, input } = args;

  const existing = await findContact(db, phone, email);
  if (existing) {
    await fillGaps(db, existing, { phone, email, name });
    return { contactId: existing.id, created: false };
  }

  const now = new Date();
  try {
    const [row] = await db
      .insert(contact)
      .values({
        name,
        phone,
        email,
        stage: ContactStage.LEAD,
        source: input.source,
        sourcePlatform: input.platform ?? null,
        campaign: input.campaignName ?? input.formName ?? null,
        campaignId: input.campaignId ?? null,
        referralCode: input.clickId ?? null,
        firstTouchAt: input.submittedAt ?? now,
        lastTouchAt: now,
      })
      .returning({ id: contact.id });
    return { contactId: row!.id, created: true };
  } catch (err) {
    // Lost a race on contact_phone_unique / contact_email_unique — the same
    // person's WhatsApp message or a duplicate delivery got there first.
    if (!isUniqueViolation(err)) throw err;
    const raced = await findContact(db, phone, email);
    if (!raced) throw err;
    return { contactId: raced.id, created: false };
  }
}

async function findContact(db: Db, phone: string | null, email: string | null) {
  if (phone) {
    const [row] = await db.select().from(contact).where(eq(contact.phone, phone)).limit(1);
    if (row) return row;
  }
  if (email) {
    const [row] = await db.select().from(contact).where(eq(contact.email, email)).limit(1);
    if (row) return row;
  }
  return null;
}

/**
 * Adds what the form told us that the contact was missing. Never overwrites:
 * a name typed by staff beats one typed into an ad form, and first-touch
 * attribution belongs to the first touch.
 */
async function fillGaps(
  db: Db,
  row: typeof contact.$inferSelect,
  found: { phone: string | null; email: string | null; name: string | null },
) {
  const patch: Partial<typeof contact.$inferInsert> = { lastTouchAt: new Date(), updatedAt: new Date() };
  if (!row.name && found.name) patch.name = found.name;
  // Only claim a phone/email nobody else holds — otherwise the unique index
  // throws and, worse, it would mean two contacts are the same person, which
  // is a merge for a human to make, not this code.
  if (!row.phone && found.phone && !(await findContact(db, found.phone, null))) patch.phone = found.phone;
  if (!row.email && found.email && !(await findContact(db, null, found.email))) patch.email = found.email;
  await db.update(contact).set(patch).where(eq(contact.id, row.id));
}


function cleanEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
