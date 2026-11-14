import { LAB_MARKERS } from "./biomarkers";

/**
 * Reading a lab sheet's text into biomarker values.
 *
 * Two things in every Redcliffe sheet broke the version this replaces, and
 * both are worth stating because they are what the regex is shaped around:
 *
 *   - The out-of-range flag sits between the value and its unit —
 *     "235 H* mg/dL". The old pattern wanted the unit immediately after the
 *     number, so every abnormal result — the ones that matter most — failed
 *     to parse, silently, and the marker came back empty.
 *   - The reference range shares the line with the value — "15 mg/dL 6 - 20".
 *     Taking "the first number after the name" reads 25 out of "Vitamin D 25
 *     - Hydroxy CLIA 33.9 ng/mL". So a number counts as a value only when a
 *     unit we recognise follows it, and only when that unit is one this
 *     marker is actually reported in.
 *
 * Nothing here writes to the database. Parsing is a guess about a PDF; a
 * person confirms it before it becomes a reading.
 */

/**
 * Units, longest form first.
 *
 * Order is load-bearing: alternation is leftmost-first, so the "…g/mL" form
 * has to be reachable before bare "pg", or "347 pg/mL" parses as 347 pg.
 */
const UNIT_ALTERNATIVES = [
  String.raw`m?[lL]\s*/\s*min\s*/\s*1\.73\s*(?:sq\.?\s*m|m2|m²)`,
  String.raw`10\s*\^\s*\d+\s*/\s*[µμu]?[lL]`,
  String.raw`[µμu]IU\s*/\s*m[lL]`,
  String.raw`m?IU\s*/\s*[dm]?[lL]`,
  String.raw`[mµμunp]?g\s*/\s*[dm]?[lL]`,
  String.raw`[mµμun]mol\s*/\s*[lL]`,
  String.raw`U\s*/\s*[lL]`,
  String.raw`f[lL]`,
  String.raw`%`,
  String.raw`Ratio`,
  String.raw`pg`,
];

const MEASUREMENT = new RegExp(
  // the value, then the optional H* / L* / CH* / CL* flag, then a unit
  String.raw`(-?\d+(?:\.\d+)?)\s*(?:(?:CH|CL|H|L)\s*\*?\s*)?(` +
    UNIT_ALTERNATIVES.join("|") +
    String.raw`)(?![A-Za-z0-9])`,
  "gi",
);

/** One spelling per unit, so a sheet's "10^3/µl" and "10^3/uL" compare equal. */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;

  // Labs use both the micro sign (µ, U+00B5) and Greek mu (μ, U+03BC) —
  // Tata 1mg prints "10^3/μL". They mean the same thing.
  const compact = unit.replace(/\s+/g, "").replace(/[µμ]/g, "u").toLowerCase();

  if (/^m?l\/min\/1\.73/.test(compact)) return "mL/min/1.73 m²";
  if (compact === "%") return "%";
  if (compact === "ratio") return "Ratio";
  if (compact === "fl") return "fL";
  if (compact === "pg") return "pg";
  if (compact === "u/l") return "U/L";

  const counts = /^10\^(\d+)\/u?l$/.exec(compact);
  if (counts) return `10^${counts[1]}/uL`;

  const iu = /^(u|m)?iu\/(ml|dl|l)$/.exec(compact);
  if (iu) {
    const prefix = iu[1] === "u" ? "µ" : (iu[1] ?? "");
    const volume = iu[2] === "ml" ? "mL" : iu[2] === "dl" ? "dL" : "L";
    return `${prefix}IU/${volume}`;
  }

  const mass = /^([mungp]?)g\/(d|m)?l$/.exec(compact);
  if (mass) {
    const prefix = mass[1] === "u" ? "µ" : (mass[1] ?? "");
    const volume = mass[2] === "d" ? "dL" : mass[2] === "m" ? "mL" : "L";
    return `${prefix}g/${volume}`;
  }

  const molar = /^([munp]?)mol\/l$/.exec(compact);
  if (molar) return `${molar[1] === "u" ? "µ" : (molar[1] ?? "")}mol/L`;

  return unit.trim();
}

function normalizeLine(text: string) {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The first measurement in `text` whose unit is one this marker is reported
 * in — not simply the first number, and not the first number with any unit.
 */
function firstMeasurement(text: string, accepted?: string[]) {
  const wanted = accepted?.map((u) => normalizeUnit(u));
  MEASUREMENT.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MEASUREMENT.exec(text)) !== null) {
    const unit = normalizeUnit(match[2]);
    if (!unit) continue;
    if (wanted && !wanted.includes(unit)) continue;
    return { value: Number(match[1]), unit };
  }

  return null;
}

export interface ParsedMarker {
  key: string;
  shortCode: string;
  label: string;
  value: number;
  unit: string | null;
  /** The spelling it was found under on the sheet. Null when derived. */
  matchedAlias: string | null;
  /** The keys it was computed from, for a derived value. */
  derivedFrom?: string[];
}

export interface ParsedReport {
  /** Only catalogue markers — the rows read purely to divide are not here. */
  markers: ParsedMarker[];
  /** Catalogue markers this panel covers but that could not be read. */
  missing: { key: string; shortCode: string; label: string }[];
  /** Draw date, ISO yyyy-mm-dd. The sheet's own date, never today's. */
  collectedOn: string | null;
  reportedOn: string | null;
  patientName: string | null;
  ageYears: number | null;
  gender: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * The date after the first of these labels that has one, ISO yyyy-mm-dd:
 *   "Sample Collected : Sep 20, 2026, 07:28 PM"   (Redcliffe)
 *   "Collection Date : 04/Jun/2026 12:39PM"       (Tata 1mg)
 *   "Report Date : 04-06-2026"                    (day first, as Indian labs write it)
 */
function sheetDate(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const after = new RegExp(`${label}\\s*:?\\s*([^\\n]{0,40})`, "i").exec(text)?.[1];
    if (!after) continue;

    const monthFirst = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})/.exec(after);
    const dayMonthName = /^(\d{1,2})[\/\-\s]([A-Za-z]{3,9})[\/\-\s,]+(\d{4})/.exec(after);
    const numeric = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(after);

    let day: number, month: number | undefined, year: number;
    if (monthFirst) {
      month = MONTHS[monthFirst[1]!.slice(0, 3).toLowerCase()];
      day = Number(monthFirst[2]);
      year = Number(monthFirst[3]);
    } else if (dayMonthName) {
      day = Number(dayMonthName[1]);
      month = MONTHS[dayMonthName[2]!.slice(0, 3).toLowerCase()];
      year = Number(dayMonthName[3]);
    } else if (numeric) {
      day = Number(numeric[1]);
      month = Number(numeric[2]);
      year = Number(numeric[3]);
    } else continue;

    if (!month || month > 12 || !day || day > 31 || !year) continue;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

/**
 * The labels a patient's name sits behind. Never a bare "patient": the
 * disclaimers are full of it ("…being to the patient named or identified…"),
 * and matching that put a sentence fragment in the name box.
 */
const NAME_LABEL = /(?:Patient\s*Name|Customer\s*Name|Name\s*of\s*Patient)\s*:\s*/i;
/** The field that follows the name on the same row, so the name stops there. */
const NEXT_FIELD =
  /\s+(?:Collected\s*Via|DOB|D\.O\.B|Age|Gender|Sex|Report|Referred|Ref\.?\s*By|Lab\s*Visit|Sample|Patient\s*ID|UHID|Registration|Reg\.?\s*No|Bill|Barcode|Mobile|Phone)\b.*$/i;

function patientName(text: string): string | null {
  const start = NAME_LABEL.exec(text);
  if (!start) return null;
  const row = text.slice(start.index + start[0].length).split("\n")[0] ?? "";
  const name = row
    .replace(NEXT_FIELD, "")
    .replace(/^(?:Mr|Mrs|Ms|Miss|Master|Baby|Dr)\.?\s*/i, "")
    .trim();
  // Letters, spaces and a few marks — anything else is not a name.
  return /^[A-Za-z][A-Za-z .'-]{1,60}$/.test(name) ? name : null;
}

/**
 * eGFR by CKD-EPI 2021 (no race term), for a sheet that reports creatinine
 * but not eGFR. Needs age and sex off the same sheet; without them it is not
 * guessed.
 */
function ckdEpi2021(creatinine: number, age: number, female: boolean): number {
  const kappa = female ? 0.7 : 0.9;
  const alpha = female ? -0.241 : -0.302;
  const ratio = creatinine / kappa;
  return Math.round(
    142 * Math.min(ratio, 1) ** alpha * Math.max(ratio, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1),
  );
}

/**
 * Read one lab sheet.
 *
 * `text` is the PDF laid out row by row — see ./pdf.ts, which groups items
 * by y position so a table row arrives as one line. The three-line window
 * also covers the other layout these sheets come out in, where the test
 * name, its method and its value land on separate lines.
 */
export function parseReport(text: string): ParsedReport {
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const whole = lines.join("\n");

  const found = new Map<string, ParsedMarker>();

  // Longest alias first within each marker, so "Vitamin D 25 - Hydroxy" is
  // tried before "Vitamin D".
  const direct = LAB_MARKERS.filter((m) => m.aliases.length > 0).map((m) => ({
    ...m,
    aliases: [...m.aliases].sort((a, b) => b.length - a.length),
  }));

  for (let i = 0; i < lines.length; i++) {
    const window = lines.slice(i, i + 3).join(" ");

    for (const marker of direct) {
      if (found.has(marker.key)) continue;

      for (const alias of marker.aliases) {
        // Anchored to the start of the row, and the alias must end at a
        // space, a colon or the end of it. What a lab sheet has most of is
        // names inside other names: this is what keeps "HDL Cholesterol"
        // out of "Non HDL Cholesterol" and "Bun" out of "Bun/Creatinine
        // Ratio".
        const anchored = new RegExp(`^${escapeRegex(alias)}(?=$|[\\s:])`, "i");
        const match = anchored.exec(window);
        if (!match) continue;

        const measurement = firstMeasurement(window.slice(match[0].length), marker.units);
        if (!measurement) continue;

        found.set(marker.key, {
          key: marker.key,
          shortCode: marker.shortCode,
          label: marker.label,
          value: measurement.value,
          unit: measurement.unit,
          matchedAlias: alias,
        });
        break;
      }
    }
  }

  // Derived values, once everything they divide is in.
  for (const marker of LAB_MARKERS) {
    if (!marker.ratioOf || found.has(marker.key)) continue;

    const pair = [marker.ratioOf, marker.ratioFallback]
      .filter((p): p is [string, string] => !!p)
      .find(([a, b]) => found.has(a) && found.has(b));

    if (!pair) continue;

    const numerator = found.get(pair[0])!.value;
    const denominator = found.get(pair[1])!.value;
    if (!denominator) continue;

    found.set(marker.key, {
      key: marker.key,
      shortCode: marker.shortCode,
      label: marker.label,
      // Two decimals: the sheet's own inputs carry one or two, and more
      // would be precision this number does not have.
      value: Number((numerator / denominator).toFixed(2)),
      unit: marker.derivedUnit ?? null,
      matchedAlias: null,
      derivedFrom: pair,
    });
  }

  const catalogue = LAB_MARKERS.filter((m) => m.shortCode);

  // "30 Y / Male" (Redcliffe) and "30Y 5M 3D /Male" (Tata 1mg).
  const ageMatch =
    /(\d{1,3})\s*Y(?:rs?|ears?)?(?:\s*\d{1,2}\s*M)?(?:\s*\d{1,2}\s*D)?\s*\/\s*(Male|Female|Other)/i.exec(whole);
  const ageYears = ageMatch ? Number(ageMatch[1]) : null;
  const gender = ageMatch?.[2] ? ageMatch[2].toUpperCase() : null;

  // eGFR from creatinine, when the sheet has creatinine but no eGFR row.
  const creatinine = found.get("creatinine");
  if (!found.has("egfr") && creatinine && ageYears && (gender === "MALE" || gender === "FEMALE")) {
    found.set("egfr", {
      key: "egfr",
      shortCode: "eGFR",
      label: "eGFR",
      value: ckdEpi2021(creatinine.value, ageYears, gender === "FEMALE"),
      unit: "mL/min/1.73 m²",
      matchedAlias: null,
      derivedFrom: ["creatinine", "age", "sex"],
    });
  }

  return {
    markers: catalogue
      .map((m) => found.get(m.key))
      .filter((m): m is ParsedMarker => !!m),
    missing: catalogue
      .filter((m) => !found.has(m.key))
      .map((m) => ({ key: m.key, shortCode: m.shortCode, label: m.label })),
    collectedOn: sheetDate(whole, ["Sample Collected", "Collection Date", "Collected On", "Sample Collection Date"]),
    reportedOn: sheetDate(whole, ["Report Date", "Reported On", "Report Released"]),
    patientName: patientName(whole),
    ageYears,
    gender,
  };
}
