import type { LeadInput } from "@workspace/db/lead-intake";

// Maps each provider's lead payload onto LeadInput. Kept apart from the HTTP
// server so the Meta backfill script reads leads through the exact same code
// as the webhook — two mappings would drift, and a lead would look different
// depending on which path happened to pick it up.

const GRAPH = "https://graph.facebook.com/v21.0";

// ---------------------------------------------------------------------------
// Shared: pulling name / phone / email out of a bag of answers
// ---------------------------------------------------------------------------

const NAME_KEYS = ["full_name", "name", "fullname", "your_name"];
const FIRST_KEYS = ["first_name", "firstname", "fname"];
const LAST_KEYS = ["last_name", "lastname", "lname", "surname"];
const PHONE_KEYS = ["phone_number", "phone", "mobile", "mobile_number", "whatsapp", "whatsapp_number", "contact_number"];
const EMAIL_KEYS = ["email", "email_address", "work_email"];

function keyOf(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function pick(answers: Record<string, string>, keys: string[]): string | null {
  for (const [label, value] of Object.entries(answers)) {
    if (value && keys.includes(keyOf(label))) return value;
  }
  return null;
}

export function identityFromAnswers(answers: Record<string, string>) {
  const full = pick(answers, NAME_KEYS);
  const first = pick(answers, FIRST_KEYS);
  const last = pick(answers, LAST_KEYS);
  return {
    name: full ?? ([first, last].filter(Boolean).join(" ") || null),
    phone: pick(answers, PHONE_KEYS),
    email: pick(answers, EMAIL_KEYS),
  };
}

// ---------------------------------------------------------------------------
// Meta Lead Ads
// ---------------------------------------------------------------------------

/** One `leadgen` change from a Page webhook. Meta sends ids only, never answers. */
export interface MetaLeadgenChange {
  leadgen_id: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  created_time?: number;
}

interface MetaLead {
  id: string;
  created_time?: string;
  field_data?: { name: string; values?: string[] }[];
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  is_organic?: boolean;
  platform?: string;
  // Present on leads from the Lead Ads Testing Tool.
  is_test?: boolean;
}

/**
 * The token to read a Page's leads with. META_PAGE_TOKENS ({"<pageId>":
 * "<token>"}) for several Pages; META_PAGE_ACCESS_TOKEN for one Page or a
 * system-user token that covers all of them.
 */
const pageTokenCache = new Map<string, string>();

/**
 * A system-user token can read one lead by id, but listing a Page's forms
 * requires a Page token. Exchange once and reuse it.
 */
export async function pageTokenFor(pageId: string): Promise<string> {
  const cached = pageTokenCache.get(pageId);
  if (cached) return cached;
  const token = metaTokenFor(pageId);
  if (!token) throw new Error(`no token for page ${pageId}`);
  try {
    const page = await graphGet<{ access_token?: string }>(pageId, token, { fields: "access_token" });
    if (page.access_token) {
      pageTokenCache.set(pageId, page.access_token);
      return page.access_token;
    }
  } catch {
    // Already a page token — listing works with it directly.
  }
  pageTokenCache.set(pageId, token);
  return token;
}

export function metaTokenFor(pageId: string | null | undefined): string | null {
  const map = process.env.META_PAGE_TOKENS;
  if (map && pageId) {
    try {
      const tokens = JSON.parse(map) as Record<string, string>;
      if (tokens[pageId]) return tokens[pageId];
    } catch {
      console.error("[leads] META_PAGE_TOKENS is not valid JSON");
    }
  }
  return process.env.META_PAGE_ACCESS_TOKEN ?? null;
}

async function graphGet<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || body.error) {
    throw new Error(`Graph ${path}: [${body.error?.code ?? res.status}] ${body.error?.message ?? res.statusText}`);
  }
  return body;
}

const LEAD_FIELDS =
  "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,is_organic,platform";

// Form names never change once published, and a busy campaign sends many leads
// per form — one Graph call per form per process is plenty.
const formNames = new Map<string, string | null>();

async function formName(formId: string | undefined, token: string): Promise<string | null> {
  if (!formId) return null;
  if (formNames.has(formId)) return formNames.get(formId)!;
  try {
    const form = await graphGet<{ name?: string }>(formId, token, { fields: "name" });
    formNames.set(formId, form.name ?? null);
    return form.name ?? null;
  } catch {
    return null; // cosmetic — never fail a lead over its form's name
  }
}

function metaPlatform(platform: string | undefined): string {
  if (platform === "ig") return "INSTAGRAM";
  if (platform === "fb") return "FACEBOOK";
  return platform ? platform.toUpperCase() : "FACEBOOK";
}

export function metaLeadToInput(lead: MetaLead, extra: { pageId?: string | null; formName?: string | null }): LeadInput {
  const answers: Record<string, string> = {};
  for (const field of lead.field_data ?? []) {
    answers[field.name] = (field.values ?? []).join(", ");
  }
  const identity = identityFromAnswers(answers);
  return {
    provider: "meta",
    externalId: lead.id,
    ...identity,
    answers,
    formId: lead.form_id ?? null,
    formName: extra.formName ?? null,
    campaignId: lead.campaign_id ?? null,
    campaignName: lead.campaign_name ?? null,
    adsetId: lead.adset_id ?? null,
    adsetName: lead.adset_name ?? null,
    adId: lead.ad_id ?? null,
    adName: lead.ad_name ?? null,
    platform: metaPlatform(lead.platform),
    pageId: extra.pageId ?? null,
    raw: lead,
    isTest: lead.is_test ?? false,
    isOrganic: lead.is_organic ?? false,
    submittedAt: lead.created_time ? new Date(lead.created_time) : null,
    source: "SOCIAL_MEDIA",
  };
}

/** Reads the lead behind a webhook's leadgen_id. Throws if it cannot. */
export async function fetchMetaLead(leadgenId: string, pageId: string | null | undefined): Promise<LeadInput> {
  const token = pageId ? await pageTokenFor(pageId) : metaTokenFor(pageId);
  if (!token) throw new Error("no Meta page token configured (META_PAGE_ACCESS_TOKEN / META_PAGE_TOKENS)");
  const lead = await graphGet<MetaLead>(leadgenId, token, { fields: LEAD_FIELDS });
  return metaLeadToInput(lead, { pageId, formName: await formName(lead.form_id, token) });
}

/** Every lead form on a Page — for the backfill. */
export async function listMetaForms(pageId: string): Promise<{ id: string; name?: string; status?: string }[]> {
  const token = await pageTokenFor(pageId);
  const forms: { id: string; name?: string; status?: string }[] = [];
  let after: string | undefined;
  do {
    const page = await graphGet<{ data: { id: string; name?: string; status?: string }[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${pageId}/leadgen_forms`,
      token,
      { fields: "id,name,status", limit: "100", ...(after ? { after } : {}) },
    );
    forms.push(...page.data);
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
  } while (after);
  return forms;
}

/** A form's leads created since `since` — for the backfill. */
export async function listMetaLeads(
  pageId: string,
  form: { id: string; name?: string },
  since: Date,
): Promise<LeadInput[]> {
  const token = await pageTokenFor(pageId);
  const out: LeadInput[] = [];
  const filtering = JSON.stringify([
    { field: "time_created", operator: "GREATER_THAN", value: Math.floor(since.getTime() / 1000) },
  ]);
  let after: string | undefined;
  do {
    const page = await graphGet<{ data: MetaLead[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${form.id}/leads`,
      token,
      { fields: LEAD_FIELDS, limit: "100", filtering, ...(after ? { after } : {}) },
    );
    for (const lead of page.data) out.push(metaLeadToInput(lead, { pageId, formName: form.name ?? null }));
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
  } while (after);
  return out;
}

// ---------------------------------------------------------------------------
// Google Ads lead form webhook
// ---------------------------------------------------------------------------

export interface GoogleLeadPayload {
  lead_id?: string;
  api_version?: string;
  form_id?: number | string;
  campaign_id?: number | string;
  adgroup_id?: number | string;
  creative_id?: number | string;
  gcl_id?: string;
  google_key?: string;
  is_test?: boolean;
  lead_submit_time?: string;
  user_column_data?: { column_name?: string; column_id?: string; string_value?: string }[];
}

const GOOGLE_COLUMN_LABEL: Record<string, string> = {
  FULL_NAME: "full_name",
  FIRST_NAME: "first_name",
  LAST_NAME: "last_name",
  PHONE_NUMBER: "phone_number",
  EMAIL: "email",
  WORK_EMAIL: "work_email",
  CITY: "city",
  POSTAL_CODE: "postal_code",
  COUNTRY: "country",
};

const str = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));

export function googleLeadToInput(body: GoogleLeadPayload): LeadInput {
  const answers: Record<string, string> = {};
  for (const col of body.user_column_data ?? []) {
    // Standard fields get a stable key; custom questions keep the question
    // text Google sends as column_name, which is what a caller wants to read.
    const label =
      (col.column_id && GOOGLE_COLUMN_LABEL[col.column_id]) || col.column_name || col.column_id || "field";
    answers[label] = col.string_value ?? "";
  }
  return {
    provider: "google",
    externalId: String(body.lead_id),
    ...identityFromAnswers(answers),
    answers,
    formId: str(body.form_id),
    campaignId: str(body.campaign_id),
    adsetId: str(body.adgroup_id),
    adId: str(body.creative_id),
    platform: "GOOGLE",
    raw: { ...body, google_key: undefined },
    isTest: body.is_test ?? false,
    submittedAt: body.lead_submit_time ? new Date(body.lead_submit_time) : null,
    source: "GOOGLE_ADS",
    clickId: body.gcl_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Our own website / landing pages
// ---------------------------------------------------------------------------

// Fields the site sends that are tracking, not answers.
const WEBSITE_META_KEYS = new Set([
  "submissionid", "formname", "form", "page", "pageurl", "referrer",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "gclid", "fbclid", "website", "_hp", "key",
]);

export function websiteLeadToInput(body: Record<string, unknown>, externalId: string): LeadInput {
  const answers: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (WEBSITE_META_KEYS.has(k.toLowerCase())) continue;
    if (v === null || v === undefined || typeof v === "object") continue;
    answers[k] = String(v).slice(0, 2000);
  }
  // Accept camelCase names from the site too (firstName, lastName).
  const normalized = Object.fromEntries(
    Object.entries(answers).map(([k, v]) => [k.replace(/([a-z])([A-Z])/g, "$1_$2"), v]),
  );
  const gclid = str(body.gclid);
  const fbclid = str(body.fbclid);
  const utmSource = str(body.utm_source);
  return {
    provider: "website",
    externalId,
    ...identityFromAnswers(normalized),
    answers,
    formName: str(body.formName) ?? str(body.form) ?? "Website form",
    campaignName: str(body.utm_campaign),
    campaignId: str(body.utm_id),
    adName: str(body.utm_content),
    platform: utmSource ? utmSource.toUpperCase() : "WEBSITE",
    raw: body,
    submittedAt: new Date(),
    source: gclid ? "GOOGLE_ADS" : fbclid ? "SOCIAL_MEDIA" : "WEBSITE",
    clickId: gclid ?? fbclid,
  };
}
