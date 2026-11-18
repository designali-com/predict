import type {
  DashboardBiomarker,
  DashboardDomain,
  DashboardIndex,
  PatientDashboard,
  Severity,
} from "@workspace/db/patient-dashboard"

export type {
  DashboardBiomarker,
  DashboardDomain,
  DashboardIndex,
  PatientDashboard,
  Severity,
}

/**
 * The presentation half of the dashboard: colour, position, wording.
 *
 * Kept apart from the numbers on purpose — everything in here is a choice
 * about how something looks, and nothing in here may invent a value. If a
 * figure is missing the helpers return null and the component shows a gap.
 */

/** A biomarker is inside its reference range when |Z| ≤ 2 — sd is range/4. */
export const IN_RANGE_Z = 2

export const SEVERITY_COLOR: Record<Severity, string> = {
  normal: "var(--color-status-normal, #3EC873)",
  mild: "var(--color-status-mild, #E4BD36)",
  moderate: "var(--color-status-moderate, #FB9B00)",
  severe: "var(--color-status-severe, #F5642B)",
  extreme: "var(--color-status-extreme, #E62A3B)",
}

export const UNMEASURED_COLOR = "var(--color-muted-foreground, #94a3b8)"

export const SEVERITY_LABEL: Record<Severity, string> = {
  normal: "Normal",
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
  extreme: "Extreme",
}

export function severityColor(severity: Severity | null | undefined) {
  return severity ? SEVERITY_COLOR[severity] : UNMEASURED_COLOR
}

/**
 * Where each domain sits on anatomy.png, as a percentage of the image.
 *
 * A picture of a body is the one thing that cannot come out of the database —
 * there is no column for "the kidneys are here". A domain with no entry is
 * still listed beside the figure, it just gets no dot, which is better than
 * dropping a real result because nobody placed a pin for it.
 */
export const DOMAIN_POSITION: Record<string, { x: number; y: number }> = {
  PNF: { x: 50, y: 9 },
  VAF: { x: 50, y: 25 },
  CMF: { x: 55, y: 39 },
  IFR: { x: 41, y: 52 },
  RFF: { x: 64, y: 61 },
  MHF: { x: 79, y: 35 },
  BMF: { x: 38, y: 71 },
}

/**
 * Short, plain-language notes about what a domain is.
 *
 * Only used when biomarker_domain.description is empty — which it is for
 * every row today. It describes the domain, never the patient: nothing here
 * reads their numbers, so it cannot say something untrue about them.
 */
export const DOMAIN_BLURB: Record<string, string> = {
  PNF: "How well nerves carry signals out to the limbs.",
  VAF: "Blood vessel health and how new vessels are formed and maintained.",
  CMF: "Heart and metabolic efficiency — blood sugar, cholesterol balance, insulin sensitivity.",
  IFR: "Signs of chronic, low-grade inflammation in the body.",
  RFF: "How well the kidneys filter waste out of the blood.",
  MHF: "The combined health of bone, muscle and joint tissue.",
  BMF: "Bone turnover and mineral balance — calcium, phosphorus, vitamin D.",
}

/** "Cardiometabolic Function (CMF)" → "Cardiometabolic Function". */
export function cleanName(name: string, shortCode: string) {
  return name
    .replace(new RegExp(`\\s*\\(\\s*${shortCode}\\s*\\)\\s*:?\\s*$`, "i"), "")
    .replace(/[:\s]+$/, "")
    .trim()
}

export function domainBlurb(domain: DashboardDomain) {
  return domain.description?.trim() || DOMAIN_BLURB[domain.shortCode] || null
}

/** 57.152… → "57". Ages are not reported to a decimal place anywhere else. */
export function age(value: number) {
  return Math.round(value)
}

/** +10.15 → "+10 years", −0.4 → "same as your age". */
export function deltaPhrase(deltaAge: number) {
  const years = Math.round(Math.abs(deltaAge))
  if (years === 0) return "the same as your actual age"
  return `${years} year${years === 1 ? "" : "s"} ${deltaAge > 0 ? "older" : "younger"}`
}

export function formatValue(value: number) {
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2)))
}

export function referenceRange(b: DashboardBiomarker) {
  if (b.rangeMin == null || b.rangeMax == null) return "no reference range set"
  return `${formatValue(b.rangeMin)}–${formatValue(b.rangeMax)}${b.unit ? ` ${b.unit}` : ""}`
}

export function measuredDomains(index: DashboardIndex) {
  return index.domains.filter((d) => d.measured)
}

export function unmeasuredDomains(index: DashboardIndex) {
  return index.domains.filter((d) => !d.measured)
}

export function findDomain(index: DashboardIndex | null, id: string | null) {
  if (!index) return null
  return index.domains.find((d) => d.id === id) ?? measuredDomains(index)[0] ?? index.domains[0] ?? null
}
