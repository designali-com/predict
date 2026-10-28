import type { RangeDirection, ReferenceRange } from "@workspace/ui/lib/reference-range"

export type BiomarkerCategory =
  | "inflammation"
  | "muscle"
  | "bone"
  | "metabolic"
  | "lipids"
  | "neuro-vascular"
  | "oxidative-fibrosis"
  | "kidney"
  | "cartilage"

export const biomarkerCategoryLabels: Record<BiomarkerCategory, string> = {
  inflammation: "Inflammation",
  muscle: "Muscle",
  bone: "Bone and mineral",
  metabolic: "Glucose and insulin",
  lipids: "Lipids",
  "neuro-vascular": "Nerve and blood vessel",
  "oxidative-fibrosis": "Oxidative stress and fibrosis",
  kidney: "Kidney and protein",
  cartilage: "Cartilage",
}

export type Biomarker = {
  /** URL-safe id, such as "hs-crp". */
  id: string
  /** Short name, such as "hs-CRP". */
  abbreviation: string
  /** Full name, such as "High-sensitivity C-reactive protein". */
  name: string
  /** Empty for ratios. */
  unit: string
  /** Lowest healthy value, inclusive. */
  low: number
  /** Highest healthy value, inclusive. */
  high: number
  direction: RangeDirection
  category: BiomarkerCategory
}

export const biomarkers: Biomarker[] = [
  { id: "hs-crp", abbreviation: "hs-CRP", name: "High-sensitivity C-reactive protein", unit: "mg·L⁻¹", low: 0.2, high: 3, direction: "high", category: "inflammation" },
  { id: "crp", abbreviation: "CRP", name: "C-reactive protein", unit: "mg·L⁻¹", low: 0.1, high: 4.9, direction: "high", category: "inflammation" },
  { id: "nlr", abbreviation: "NLR", name: "Neutrophil-to-lymphocyte ratio", unit: "", low: 1, high: 3, direction: "high", category: "inflammation" },
  { id: "il-6", abbreviation: "IL-6", name: "Interleukin-6", unit: "pg·mL⁻¹", low: 0.5, high: 7, direction: "high", category: "inflammation" },
  { id: "tnf-alpha", abbreviation: "TNF-α", name: "Tumor necrosis factor-α", unit: "pg·mL⁻¹", low: 1, high: 8, direction: "high", category: "inflammation" },
  { id: "ck-mm", abbreviation: "CK-MM", name: "Creatine kinase, muscle isoenzyme", unit: "U·L⁻¹", low: 50, high: 170, direction: "high", category: "muscle" },
  { id: "aldolase-a", abbreviation: "Aldolase A", name: "Aldolase A", unit: "U·L⁻¹", low: 1.2, high: 7.5, direction: "high", category: "muscle" },
  { id: "igf-1", abbreviation: "IGF-1", name: "Insulin-like growth factor-1", unit: "ng·mL⁻¹", low: 90, high: 360, direction: "low", category: "muscle" },
  { id: "myostatin", abbreviation: "Myostatin", name: "Myostatin", unit: "ng·mL⁻¹", low: 2, high: 12, direction: "high", category: "muscle" },
  { id: "mmp-9", abbreviation: "MMP-9", name: "Matrix metalloproteinase-9", unit: "ng·mL⁻¹", low: 20, high: 140, direction: "high", category: "bone" },
  { id: "ctx-ii", abbreviation: "CTX-II", name: "C-terminal cross-linked telopeptide of type II collagen", unit: "pg·mL⁻¹", low: 120, high: 450, direction: "high", category: "bone" },
  { id: "pth", abbreviation: "PTH", name: "Parathyroid hormone", unit: "pg·mL⁻¹", low: 15, high: 65, direction: "high", category: "bone" },
  { id: "ca-p-ratio", abbreviation: "Ca/P ratio", name: "Calcium-to-phosphorus ratio", unit: "", low: 2, high: 2.8, direction: "both", category: "bone" },
  { id: "vitamin-d", abbreviation: "Vitamin D", name: "25-hydroxyvitamin D", unit: "ng·mL⁻¹", low: 30, high: 100, direction: "low", category: "bone" },
  { id: "osteocalcin", abbreviation: "Osteocalcin", name: "Osteocalcin", unit: "ng·mL⁻¹", low: 11, high: 43, direction: "low", category: "bone" },
  { id: "pinp", abbreviation: "PINP", name: "Procollagen type I N-terminal propeptide", unit: "ng·mL⁻¹", low: 20, high: 80, direction: "low", category: "bone" },
  { id: "fbs", abbreviation: "FBS", name: "Fasting blood sugar", unit: "mg·dL⁻¹", low: 70, high: 99, direction: "high", category: "metabolic" },
  { id: "fsi", abbreviation: "FSI", name: "Fasting serum insulin", unit: "µIU·mL⁻¹", low: 2, high: 20, direction: "high", category: "metabolic" },
  { id: "hba1c", abbreviation: "HbA1c", name: "Glycated hemoglobin", unit: "%", low: 4, high: 5.6, direction: "high", category: "metabolic" },
  { id: "total-cholesterol", abbreviation: "TC", name: "Total cholesterol", unit: "mg·dL⁻¹", low: 120, high: 199, direction: "high", category: "lipids" },
  { id: "ldl-c", abbreviation: "LDL-C", name: "Low-density lipoprotein cholesterol", unit: "mg·dL⁻¹", low: 50, high: 99, direction: "high", category: "lipids" },
  { id: "hdl-c", abbreviation: "HDL-C", name: "High-density lipoprotein cholesterol", unit: "mg·dL⁻¹", low: 40, high: 80, direction: "low", category: "lipids" },
  { id: "triglycerides", abbreviation: "TG", name: "Triglycerides", unit: "mg·dL⁻¹", low: 50, high: 149, direction: "high", category: "lipids" },
  { id: "bdnf", abbreviation: "BDNF", name: "Brain-derived neurotrophic factor", unit: "ng·mL⁻¹", low: 15, high: 40, direction: "low", category: "neuro-vascular" },
  { id: "vegf", abbreviation: "VEGF", name: "Vascular endothelial growth factor", unit: "pg·mL⁻¹", low: 30, high: 250, direction: "context", category: "neuro-vascular" },
  { id: "nox", abbreviation: "NOx", name: "Nitric oxide metabolites (nitrate + nitrite)", unit: "µmol·L⁻¹", low: 20, high: 60, direction: "low", category: "neuro-vascular" },
  { id: "ngf", abbreviation: "NGF", name: "Nerve growth factor", unit: "pg·mL⁻¹", low: 20, high: 80, direction: "low", category: "neuro-vascular" },
  { id: "substance-p", abbreviation: "Substance P", name: "Substance P", unit: "pg·mL⁻¹", low: 30, high: 200, direction: "high", category: "neuro-vascular" },
  { id: "gfap", abbreviation: "GFAP", name: "Glial fibrillary acidic protein", unit: "pg·mL⁻¹", low: 20, high: 120, direction: "high", category: "neuro-vascular" },
  { id: "et-1", abbreviation: "ET-1", name: "Endothelin-1", unit: "pg·mL⁻¹", low: 0.5, high: 3, direction: "high", category: "neuro-vascular" },
  { id: "mda", abbreviation: "MDA", name: "Malondialdehyde", unit: "µmol·L⁻¹", low: 1, high: 3.5, direction: "high", category: "oxidative-fibrosis" },
  { id: "tgf-beta1", abbreviation: "TGF-β1", name: "Transforming growth factor-β1", unit: "ng·mL⁻¹", low: 1, high: 8, direction: "high", category: "oxidative-fibrosis" },
  { id: "timp-1", abbreviation: "TIMP-1", name: "Tissue inhibitor of metalloproteinase-1", unit: "ng·mL⁻¹", low: 60, high: 180, direction: "low", category: "oxidative-fibrosis" },
  { id: "egfr", abbreviation: "eGFR", name: "Estimated glomerular filtration rate", unit: "mL·min⁻¹·1.73 m⁻²", low: 90, high: 120, direction: "low", category: "kidney" },
  { id: "creatinine", abbreviation: "Cr", name: "Creatinine, serum", unit: "mg·dL⁻¹", low: 0.7, high: 1.3, direction: "high", category: "kidney" },
  { id: "bun", abbreviation: "BUN", name: "Blood urea nitrogen", unit: "mg·dL⁻¹", low: 7, high: 20, direction: "high", category: "kidney" },
  { id: "uric-acid", abbreviation: "UA", name: "Uric acid", unit: "mg·dL⁻¹", low: 3.5, high: 7.2, direction: "high", category: "kidney" },
  { id: "urea", abbreviation: "Urea", name: "Serum urea", unit: "mg·dL⁻¹", low: 15, high: 40, direction: "high", category: "kidney" },
  { id: "albumin", abbreviation: "ALB", name: "Serum albumin", unit: "g·dL⁻¹", low: 3.5, high: 5, direction: "low", category: "kidney" },
  { id: "comp", abbreviation: "COMP", name: "Cartilage oligomeric matrix protein", unit: "ng·mL⁻¹", low: 200, high: 600, direction: "high", category: "cartilage" },
]

/** A biomarker by id, or undefined. */
export function getBiomarker(id: string) {
  return biomarkers.find((biomarker) => biomarker.id === id)
}

/** The biomarker's healthy range, ready for flagging. */
export function biomarkerRange(biomarker: Biomarker): ReferenceRange {
  const { low, high, direction } = biomarker
  return { low, high, direction }
}
