/**
 * What the parser looks for on a lab sheet, and where each value belongs.
 *
 * Written against the Redcliffe Labs "Bharat Swastham" sheet, which is the
 * format every report the clinic receives arrives in. That is deliberate: a
 * parser that tries to read any lab's layout reads none of them reliably,
 * and a wrong number here becomes a wrong biological age.
 *
 * The list this replaces was a bare map of name → aliases. It carried no
 * unit, so "Neutrophils 72.1 %" and "Neutrophils. 6.06 10^3/µl" — same name,
 * two different rows — could not be told apart; and no short code, so a
 * second map elsewhere had to guess which catalogue row each key meant.
 */

export interface LabMarkerDef {
  key: string;
  /**
   * The biomarker.short_code this fills, exactly as the catalogue spells it.
   * Empty for a row read only so another value can be derived from it:
   * calcium and phosphorus are on the sheet, Ca/P Ratio is what we store.
   */
  shortCode: string;
  label: string;
  /** Matched at the start of a row. Longest is tried first. */
  aliases: string[];
  /**
   * The units this marker is reported in. A row is accepted only if its unit
   * is one of these — that is what keeps the percentage row and the absolute
   * count row apart, and what stops a reference range being read as a value.
   */
  units?: string[];
  /** Computed as a ÷ b from two other keys rather than read off the sheet. */
  ratioOf?: [string, string];
  /** Used when the first pair is absent. */
  ratioFallback?: [string, string];
  derivedUnit?: string;
}

/**
 * Every catalogue marker this panel can supply, plus the four rows that
 * exist only to be divided.
 *
 * The specialist assays the catalogue also holds — IL-6, MDA,
 * CTX-II, COMP, CK-MM, Aldolase A, IGF-1, Myostatin, PINP, Osteocalcin, PTH,
 * BDNF, Substance P, VEGF, MMP-9, NOx, TGF-β1 — are not on this panel at
 * all. They are left out rather than guessed at, and the domains that need
 * them stay unmeasured, which is the truth about them.
 */
export const LAB_MARKERS: LabMarkerDef[] = [
  {
    key: "hba1c",
    shortCode: "HbA1c",
    label: "HbA1c",
    aliases: [
      "Glycosylated Hemoglobin (HbA1c)",
      "Glycosylated Haemoglobin",
      "Glycated Hemoglobin",
      "Hemoglobin A1c",
      "HbA1c",
    ],
    units: ["%"],
  },
  {
    key: "totalCholesterol",
    shortCode: "TC",
    label: "Total Cholesterol",
    // "Cholesterol - Total" is Tata 1mg's spelling.
    aliases: ["Cholesterol - Total", "Cholesterol-Total", "Total Cholesterol", "Serum Cholesterol", "Cholesterol Total"],
    units: ["mg/dL"],
  },
  {
    key: "triglycerides",
    shortCode: "TG",
    label: "Triglycerides",
    aliases: ["Triglycerides", "Triglyceride"],
    units: ["mg/dL"],
  },
  {
    key: "hdl",
    shortCode: "HDL-C",
    label: "HDL Cholesterol",
    // "Non HDL Cholesterol" is a different row with a different number. It
    // never matches, because aliases are anchored to the start of the row.
    aliases: ["Cholesterol - HDL", "Cholesterol-HDL", "HDL Cholesterol", "HDL-C"],
    units: ["mg/dL"],
  },
  {
    key: "ldl",
    shortCode: "LDL-C",
    label: "LDL Cholesterol",
    // Likewise "V.L.D.L Cholesterol" — that row starts with a V.
    // "Cholesterol - VLDL" is safe too: the alias must end at a space.
    aliases: ["Cholesterol - LDL", "Cholesterol-LDL", "LDL Cholesterol", "LDL-C"],
    units: ["mg/dL"],
  },
  {
    key: "bun",
    shortCode: "BUN",
    label: "Blood Urea Nitrogen",
    // "Bun/Creatinine Ratio" is ruled out by requiring a space after the
    // alias rather than any word boundary — a slash does not count.
    aliases: ["Blood Urea Nitrogen (BUN)", "Blood Urea Nitrogen", "BUN", "Bun"],
    units: ["mg/dL"],
  },
  {
    key: "creatinine",
    shortCode: "Creatinine",
    label: "Creatinine",
    aliases: ["Serum Creatinine", "Creatinine"],
    units: ["mg/dL"],
  },
  {
    key: "egfr",
    shortCode: "eGFR",
    label: "eGFR",
    aliases: ["eGFR (CKD-EPI)", "eGFR", "Estimated Glomerular Filtration Rate"],
    units: ["mL/min/1.73 m²"],
  },
  {
    key: "hsCrp",
    shortCode: "hs-CRP",
    label: "hs-CRP",
    // On Tata 1mg panels; Redcliffe's leaves it out. Plain "CRP" is a
    // different, far less sensitive test and is deliberately not an alias.
    aliases: ["High sensitivity CRP", "High Sensitive CRP", "hs-CRP", "hsCRP", "HS CRP"],
    units: ["mg/L"],
  },
  {
    key: "vitaminD",
    shortCode: "Vitamin D",
    label: "Vitamin D",
    aliases: [
      "Vitamin D 25 - Hydroxy",
      "Vitamin D 25-Hydroxy",
      "25 Hydroxy Vitamin D",
      "25-Hydroxyvitamin D",
      "Vitamin D",
    ],
    units: ["ng/mL"],
  },

  // ---- read only in order to be divided ----
  {
    key: "calcium",
    shortCode: "",
    label: "Calcium",
    aliases: ["Calcium Serum", "Serum Total Calcium", "Total Calcium", "Calcium"],
    units: ["mg/dL"],
  },
  {
    key: "phosphorus",
    shortCode: "",
    label: "Phosphorus",
    aliases: ["Serum Inorganic Phosphorus", "Inorganic Phosphorus", "Phosphorus", "Phosphate"],
    units: ["mg/dL"],
  },
  {
    key: "neutrophilsAbs",
    shortCode: "",
    label: "Neutrophils (absolute)",
    // The sheet writes the absolute-count rows with a trailing full stop,
    // which is the only thing separating them from the percentage rows.
    // Tata 1mg spells them out instead: "Absolute Neutrophil Count".
    aliases: ["Absolute Neutrophil Count", "Neutrophils."],
    units: ["10^3/uL"],
  },
  {
    key: "lymphocytesAbs",
    shortCode: "",
    label: "Lymphocytes (absolute)",
    aliases: ["Absolute Lymphocyte Count", "Lymphocytes."],
    units: ["10^3/uL"],
  },
  {
    key: "neutrophilsPct",
    shortCode: "",
    label: "Neutrophils (%)",
    aliases: ["Neutrophils"],
    units: ["%"],
  },
  {
    key: "lymphocytesPct",
    shortCode: "",
    label: "Lymphocytes (%)",
    aliases: ["Lymphocytes"],
    units: ["%"],
  },

  // ---- derived ----
  {
    key: "caPRatio",
    shortCode: "Ca/P Ratio",
    label: "Calcium-to-Phosphorus Ratio",
    aliases: [],
    ratioOf: ["calcium", "phosphorus"],
    derivedUnit: "Ratio",
  },
  {
    key: "nlr",
    shortCode: "NLR",
    label: "Neutrophil-to-Lymphocyte Ratio",
    aliases: [],
    // Absolute counts first — that is what the ratio is defined on. The
    // percentages give the same answer to two decimals and cover a sheet
    // that prints no absolutes.
    ratioOf: ["neutrophilsAbs", "lymphocytesAbs"],
    ratioFallback: ["neutrophilsPct", "lymphocytesPct"],
    derivedUnit: "Ratio",
  },
];

/** Parser key → catalogue short code, for the keys that have one. */
export const KEY_TO_SHORT_CODE: Record<string, string> = Object.fromEntries(
  LAB_MARKERS.filter((m) => m.shortCode).map((m) => [m.key, m.shortCode]),
);
