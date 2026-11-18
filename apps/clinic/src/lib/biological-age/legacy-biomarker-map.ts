// The PDF parser (src/lib/parser.ts + src/lib/biomarkers.ts) predates the
// superadmin-managed dynamic biomarker table and uses its own key names.
// This maps those legacy keys to the dynamic biomarker table's `shortCode`,
// so parsed report values can be matched to a real biomarker row and saved.
// Keys with no sensible 1:1 dynamic biomarker (raw glucose, calcium,
// phosphorus, VLDL, non-HDL) are intentionally left unmapped and ignored.
export const LEGACY_KEY_TO_SHORT_CODE: Record<string, string> = {
  hba1c: "HbA1c",
  cholesterol: "TC",
  triglycerides: "TG",
  hdl: "HDL-C",
  ldl: "LDL-C",
  crp: "hs-CRP",
  aldolase: "Aldolase A",
  bdnf: "BDNF",
  ckm: "CK-MM",
  tgfb1: "TGF-β1",
  mda: "MDA",
  substanceP: "Substance P",
  vegf: "VEGF",
  comp: "COMP",
  mmp9: "MMP-9",
  pth: "PTH",
  il6: "IL-6",
  osteocalcin: "Osteocalcin",
  ctxii: "CTX-II",
  creatinine: "Creatinine",
  bun: "BUN",
  vitaminD: "Vitamin D",
};
