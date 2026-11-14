import { sql, type SQL } from "@workspace/db";
import { contact } from "@workspace/db/schema";
import {
  DELHI_PIN_PATTERN,
  DELHI_PLACE_NAMES,
  KOLKATA_PIN_PATTERN,
  KOLKATA_PLACE_NAMES,
  placeWordsPattern,
} from "@workspace/db/lead-region";

/**
 * Which clinic area a lead belongs to: Delhi NCR, Kolkata, or other.
 *
 * The campaign decides first, because the ads are targeted per clinic and a
 * Kolkata campaign is marked "| Kol |" — its leads often type their town
 * ("Memari", "Burdwan") rather than "Kolkata". Without a campaign the city
 * they typed decides, matched against the places around each clinic.
 * Every other campaign runs around Delhi, so a non-Kolkata campaign is Delhi.
 */
export const REGIONS = [
  { value: "DELHI", label: "Delhi NCR" },
  { value: "KOLKATA", label: "Kolkata" },
  { value: "OTHER", label: "Other / unknown" },
] as const;

export type Region = (typeof REGIONS)[number]["value"];

export function isRegion(v: string): v is Region {
  return REGIONS.some((r) => r.value === v);
}

// The same place lists and patterns the nurture guard uses — see
// @workspace/db/lead-region, the one definition of a lead's area.
const KOLKATA_PLACES = placeWordsPattern(KOLKATA_PLACE_NAMES);
const DELHI_PLACES = placeWordsPattern(DELHI_PLACE_NAMES);

const city = sql`lower(coalesce(${contact.city}, ''))`;
const campaign = sql`lower(coalesce(${contact.campaign}, ''))`;

const IS_KOLKATA = sql`(${campaign} like '%| kol |%' or ${campaign} like '%kolkata%' or ${city} ~ ${KOLKATA_PLACES}
  or ${city} ~ ${KOLKATA_PIN_PATTERN})`;
const IS_DELHI = sql`(${city} ~ ${DELHI_PLACES} or ${city} ~ ${DELHI_PIN_PATTERN} or ${campaign} <> '')`;

export const REGION_SQL: Record<Region, SQL> = {
  KOLKATA: IS_KOLKATA,
  DELHI: sql`(not ${IS_KOLKATA} and ${IS_DELHI})`,
  OTHER: sql`(not ${IS_KOLKATA} and not ${IS_DELHI})`,
};
