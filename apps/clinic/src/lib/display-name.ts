/**
 * One way of writing a person's name, whatever case it was typed in:
 * "ANKIT GAUR", "ankit gaur" and "Ankit  gaur" all show as "Ankit Gaur".
 * Display only — the record keeps what was entered. Each word's first letter
 * is a capital, and so is a letter after a hyphen, apostrophe or full stop
 * ("D'Souza", "R.K. Jain").
 */
export function displayName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s\-'.])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase())
}

/**
 * Sex as one letter — F, M or O — however it was stored ("FEMALE", "female",
 * "Female"). Empty, unknown or a placeholder value gives null.
 */
export function sexLetter(sex: string | null | undefined): string | null {
  const s = (sex ?? "").trim().toLowerCase()
  if (s === "female" || s === "f") return "F"
  if (s === "male" || s === "m") return "M"
  if (s === "other" || s === "o") return "O"
  return null
}

/** A stage as a word, not a code: "PATIENT" → "Patient", "DO_NOT_CONTACT" → "Do not contact". */
export function stageLabel(stage: string | null | undefined): string {
  const s = (stage ?? "").trim().replace(/_/g, " ").toLowerCase()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—"
}

/** A plan as the desk says it: "Two Limbs 42 Day — In station" → "2L · 42 Day". */
export function shortPlanName(name: string): string {
  return name
    .replace(/\s*[—–-]\s*(in|out)[\s-]*station\s*$/i, "")
    .replace(/^\s*two\s+limbs?\b\s*[—–-]?\s*/i, "2L · ")
    .replace(/^\s*four\s+limbs?\b\s*[—–-]?\s*/i, "4L · ")
    .replace(/\s*·\s*$/, "")
    .trim()
}
