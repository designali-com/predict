// Which clinic area a lead is in: Delhi NCR, Kolkata, or neither.
//
// One rule for every place that asks — the Leads page's Region filter (as SQL,
// see apps/automation/src/lib/region-sql.ts) and the nurture guard that keeps
// Kolkata leads out of OPTM's Delhi follow-up (as code, below). Two copies of
// this would drift, and a lead would be "Kolkata" on screen and still get the
// Delhi messages.
//
// The campaign decides first: the ads are targeted per clinic and a Kolkata
// campaign is marked "| Kol |", while its leads often type their town
// ("Memari", "Burdwan") rather than "Kolkata". Without that, the city they gave
// decides, matched against the places around each clinic, or a PIN code.

import { placeNamesNear } from "./india-geo";

export type LeadRegion = "DELHI" | "KOLKATA" | "OTHER";

const KOLKATA_CENTER = { lat: 22.57, lng: 88.36 };
const DELHI_CENTER = { lat: 28.61, lng: 77.21 };

/** Lower-case place names that put a lead in the Kolkata area. */
export const KOLKATA_PLACE_NAMES = [...new Set([...placeNamesNear(KOLKATA_CENTER, 200), "west bengal", "bengal"])];
/** Lower-case place names that put a lead in Delhi NCR. */
export const DELHI_PLACE_NAMES = [
  ...new Set([...placeNamesNear(DELHI_CENTER, 80), "delhi", "new delhi", "dehli", "dilli", "ncr"]),
];

/** A whole-word regex over lower-cased text, usable in JS and in Postgres (~). */
export function placeWordsPattern(names: string[]): string {
  return `(^|[^a-z])(${names.map((n) => n.replace(/[^a-z ]/g, "")).filter(Boolean).join("|")})([^a-z]|$)`;
}

export const KOLKATA_PIN_PATTERN = "(^|[^0-9])7[0-4][0-9]{4}([^0-9]|$)";
export const DELHI_PIN_PATTERN = "(^|[^0-9])11[0-9]{4}([^0-9]|$)";

const kolkataWords = new RegExp(placeWordsPattern(KOLKATA_PLACE_NAMES));
const delhiWords = new RegExp(placeWordsPattern(DELHI_PLACE_NAMES));

export function isKolkataCampaign(campaign: string | null | undefined): boolean {
  const c = (campaign ?? "").toLowerCase();
  return c.includes("| kol |") || c.includes("kolkata");
}

/** The lead's area, by the same rule as the Leads page's Region filter. */
export function leadRegion(lead: { campaign?: string | null; city?: string | null }): LeadRegion {
  const city = (lead.city ?? "").toLowerCase();
  const campaign = (lead.campaign ?? "").toLowerCase();
  if (isKolkataCampaign(campaign) || kolkataWords.test(city) || new RegExp(KOLKATA_PIN_PATTERN).test(city)) return "KOLKATA";
  if (delhiWords.test(city) || new RegExp(DELHI_PIN_PATTERN).test(city) || campaign !== "") return "DELHI";
  return "OTHER";
}
