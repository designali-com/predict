// WhatsApp templates address their variables positionally ({{1}}, {{2}}),
// but callers pass them by name ({ name: "Ankit" }). communicationTemplate
// .variablesSchema is what bridges the two: it is the ordered list of names
// behind those numbers. Relying on JS object key order instead — which is
// what the send path used to do — silently swaps values around the moment a
// caller builds the object in a different order.

/** {{1}}, {{2}}, ... in ascending order, deduplicated. */
export function templatePlaceholders(bodyText: string | null | undefined): number[] {
  if (!bodyText) return [];
  const found = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return [...new Set(found)].sort((a, b) => a - b);
}

/**
 * Positional values for {{1}}, {{2}}, ... Uses variablesSchema for the
 * name-to-position mapping; falls back to insertion order only when the
 * template never declared one.
 */
export function orderTemplateVariables(
  variablesSchema: unknown,
  variables: Record<string, unknown>,
): string[] {
  const names = Array.isArray(variablesSchema)
    ? variablesSchema.filter((n): n is string => typeof n === "string")
    : [];

  if (names.length > 0) {
    return names.map((name) => String(variables[name] ?? ""));
  }
  // Numeric keys ("1", "2") are already positional — honour them directly.
  const numeric = Object.keys(variables).filter((k) => /^\d+$/.test(k));
  if (numeric.length > 0) {
    return numeric.sort((a, b) => Number(a) - Number(b)).map((k) => String(variables[k] ?? ""));
  }
  return Object.values(variables).map((v) => String(v ?? ""));
}

/**
 * The text the patient actually sees, for logging on communicationMessage —
 * the conversation view reads this, so without it a template send shows up
 * in the thread as a blob of raw JSON.
 */
export function resolveTemplateBody(
  bodyText: string | null | undefined,
  ordered: string[],
): string | null {
  if (!bodyText) return null;
  return bodyText.replace(/\{\{(\d+)\}\}/g, (match, n: string) => {
    const value = ordered[Number(n) - 1];
    return value === undefined || value === "" ? match : value;
  });
}
