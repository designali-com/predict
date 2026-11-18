// Pure constants for lead routing rules — safe to import from a client
// component, unlike ./lead-routing which talks to the database.

export const MATCH_FIELDS = [
  { key: "any", label: "Anything (city, ad, form, answers)" },
  { key: "city", label: "City / location" },
  { key: "adset", label: "Ad set name" },
  { key: "campaign", label: "Campaign name" },
  { key: "ad", label: "Ad name" },
  { key: "form", label: "Form name" },
  { key: "answers", label: "Form answers" },
  { key: "source", label: "Source / platform" },
] as const;

/** knee pain / Knee-Pain -> knee_pain. The form flows and template keys use. */
export function interestKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
