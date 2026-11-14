import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { eq, inArray } from "@workspace/db";
import { normalizePhone } from "@/src/lib/normalize-phone";
import { parseCsv, mapHeaders, toLeadRows, type LeadRow } from "@/src/lib/parse-csv";
import { requireClinicPermission } from "@/src/lib/auth/clinic";
import { announceNewLead } from "@workspace/db/lead-promotion";

// One import is one request, so it has to fit inside a function timeout.
// Larger files are truncated and *reported* as truncated — silently dropping
// the tail would look like a successful import of the whole file.
const MAX_IMPORT_ROWS = 5000;
// Well under Postgres' parameter ceiling, with room for the widest row.
const DB_CHUNK = 500;

interface PreparedLead {
  rowNumber: number;
  phone: string;
  name: string | null;
  email: string | null;
  source: string | null;
  sourcePlatform: string | null;
  campaign: string | null;
  referralCode: string | null;
}

interface RowProblem {
  row: number;
  value: string;
  reason: string;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  // The clinic this import is filed under — the one picked at the top of the
  // panel. Leads with no clinic show on no clinic's Leads list and match no
  // clinic's flows, which is how an imported lead used to vanish.
  const context = await requireClinicPermission("ops.leads");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = context.clinic.id;

  const body = await req.json().catch(() => null);
  const csv = typeof body?.csv === "string" ? body.csv : "";
  const dryRun = body?.dryRun === true;
  // Applied only where the file itself did not say — a per-file "these all
  // came from the January Instagram ad" without overriding an explicit column.
  const fallbackSource = typeof body?.source === "string" ? body.source.trim() : "";
  const fallbackCampaign = typeof body?.campaign === "string" ? body.campaign.trim() : "";

  if (!csv.trim()) {
    return NextResponse.json({ error: "The file is empty" }, { status: 400 });
  }

  const parsed = parseCsv(csv);
  const mapping = mapHeaders(parsed.headers);
  const mappedFields = [...mapping.values()];

  // Without a phone column there is nothing to message and nothing to
  // deduplicate on, so this is worth failing loudly rather than importing a
  // pile of unreachable rows.
  if (!mappedFields.includes("phone")) {
    return NextResponse.json(
      {
        error:
          "No phone column found. Name one of the columns Phone, Mobile, Number or WhatsApp.",
        headers: parsed.headers,
      },
      { status: 400 },
    );
  }

  const allRows: LeadRow[] = toLeadRows(parsed);
  const truncated = allRows.length > MAX_IMPORT_ROWS;
  const rows = allRows.slice(0, MAX_IMPORT_ROWS);

  const problems: RowProblem[] = [];
  const prepared: PreparedLead[] = [];
  const seenPhones = new Map<string, number>();
  let duplicatesInFile = 0;
  let invalidPhones = 0;

  rows.forEach((lead, index) => {
    // +2: the header occupies row 1 and spreadsheets are 1-indexed, so the
    // number in an error message matches what the user sees in Excel.
    const rowNumber = index + 2;

    const phone = normalizePhone(lead.phone ?? "");
    if (!phone.ok) {
      invalidPhones += 1;
      problems.push({
        row: rowNumber,
        value: lead.phone ?? "",
        reason: phone.error ?? "Invalid phone number",
      });
      return;
    }

    const firstSeenAt = seenPhones.get(phone.phone);
    if (firstSeenAt !== undefined) {
      duplicatesInFile += 1;
      problems.push({
        row: rowNumber,
        value: phone.phone,
        reason: `Same number as row ${firstSeenAt}`,
      });
      return;
    }
    seenPhones.set(phone.phone, rowNumber);

    prepared.push({
      rowNumber,
      phone: phone.phone,
      name: lead.name ?? null,
      email: lead.email?.toLowerCase() ?? null,
      source: lead.source ?? (fallbackSource || null),
      sourcePlatform: lead.sourcePlatform ?? null,
      campaign: lead.campaign ?? (fallbackCampaign || null),
      referralCode: lead.referralCode ?? null,
    });
  });

  // --- Match against what is already in the CRM ---------------------------
  const existingByPhone = new Map<string, typeof contact.$inferSelect>();
  for (const phones of chunk(prepared.map((p) => p.phone), DB_CHUNK)) {
    const found = await db.select().from(contact).where(inArray(contact.phone, phones));
    for (const row of found) if (row.phone) existingByPhone.set(row.phone, row);
  }

  // contact.email is uniquely indexed too, so an address already attached to
  // a different person would blow up the insert. Drop the email in that case
  // and say so, rather than losing the whole row.
  const emailOwners = new Map<string, string>();
  const emails = prepared.map((p) => p.email).filter((e): e is string => Boolean(e));
  for (const batch of chunk(emails, DB_CHUNK)) {
    const found = await db
      .select({ email: contact.email, phone: contact.phone })
      .from(contact)
      .where(inArray(contact.email, batch));
    for (const row of found) if (row.email) emailOwners.set(row.email, row.phone ?? "");
  }

  const toCreate: PreparedLead[] = [];
  const matchedExisting: { existing: typeof contact.$inferSelect; incoming: PreparedLead }[] = [];

  for (const lead of prepared) {
    if (lead.email) {
      const owner = emailOwners.get(lead.email);
      if (owner !== undefined && owner !== lead.phone) {
        problems.push({
          row: lead.rowNumber,
          value: lead.email,
          reason: "Email already belongs to another contact — imported without it",
        });
        lead.email = null;
      }
    }

    const existing = existingByPhone.get(lead.phone);
    if (existing) matchedExisting.push({ existing, incoming: lead });
    else toCreate.push(lead);
  }

  // An update only ever fills in blanks. Overwriting a name or a source that
  // staff curated with whatever a bulk file happens to contain loses work.
  const updates = matchedExisting
    .map(({ existing, incoming }) => {
      const patch: Partial<typeof contact.$inferInsert> = {};
      if (!existing.name && incoming.name) patch.name = incoming.name;
      if (!existing.email && incoming.email) patch.email = incoming.email;
      if (!existing.source && incoming.source) patch.source = incoming.source;
      if (!existing.sourcePlatform && incoming.sourcePlatform)
        patch.sourcePlatform = incoming.sourcePlatform;
      if (!existing.campaign && incoming.campaign) patch.campaign = incoming.campaign;
      if (!existing.referralCode && incoming.referralCode)
        patch.referralCode = incoming.referralCode;
      // Someone we had only broadcast to, now on a list of leads: they are one.
      if (existing.stage === "AUDIENCE") {
        patch.stage = "LEAD";
        patch.leadStatus = "NEW";
      }
      if (!existing.clinicId) patch.clinicId = clinicId;
      return { id: existing.id, patch };
    })
    .filter(({ patch }) => Object.keys(patch).length > 0);

  const summary = {
    dryRun,
    fileRows: allRows.length,
    truncated,
    willCreate: toCreate.length,
    willUpdate: updates.length,
    alreadyPresent: matchedExisting.length,
    duplicatesInFile,
    invalidPhones,
    detectedColumns: Object.fromEntries(
      [...mapping.entries()].map(([index, field]) => [parsed.headers[index] ?? `#${index}`, field]),
    ),
    // A long file of bad rows would otherwise return a megabyte of errors.
    problems: problems.slice(0, 100),
    problemCount: problems.length,
  };

  if (dryRun) return NextResponse.json(summary);

  let created = 0;
  const now = new Date();

  for (const batch of chunk(toCreate, DB_CHUNK)) {
    const inserted = await db
      .insert(contact)
      .values(
        batch.map((lead) => ({
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          stage: "LEAD",
          source: lead.source || "CSV_IMPORT",
          sourcePlatform: lead.sourcePlatform,
          campaign: lead.campaign,
          referralCode: lead.referralCode,
          clinicId,
          firstTouchAt: now,
        })),
      )
      // Backstop for a concurrent import racing this one; the pre-checks
      // above already cover the ordinary duplicate cases.
      .onConflictDoNothing()
      .returning({ id: contact.id });
    created += inserted.length;
    // Announced like a lead from any other door, so the new-lead flows start.
    for (const row of inserted) await announceNewLead(db, row.id, { source: "CSV_IMPORT" });
  }

  let updated = 0;
  for (const { id, patch } of updates) {
    await db
      .update(contact)
      .set({ ...patch, updatedAt: now })
      .where(eq(contact.id, id));
    updated += 1;
    // Promoted from audience by this file: a new lead as far as flows care.
    if (patch.stage === "LEAD") await announceNewLead(db, id, { source: "CSV_IMPORT", promotedFrom: "AUDIENCE" });
  }

  return NextResponse.json({ ...summary, created, updated });
}
