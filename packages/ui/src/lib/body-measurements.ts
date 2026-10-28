/** Body mass index: weight in kilograms over height in metres squared. */
export function bodyMassIndex(weightKg: number, heightCm: number) {
  const metres = heightCm / 100
  return weightKg / (metres * metres)
}

export type BmiCategory =
  | "underweight"
  | "normal"
  | "overweight"
  | "obesity-1"
  | "obesity-2"
  | "obesity-3"

/**
 * The WHO category of an adult's BMI. Children and adolescents are assessed
 * with BMI-for-age percentiles instead.
 */
export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return "underweight"
  if (bmi < 25) return "normal"
  if (bmi < 30) return "overweight"
  if (bmi < 35) return "obesity-1"
  if (bmi < 40) return "obesity-2"
  return "obesity-3"
}

export const bmiCategoryLabels: Record<BmiCategory, string> = {
  underweight: "Underweight",
  normal: "Normal weight",
  overweight: "Overweight",
  "obesity-1": "Obesity class I",
  "obesity-2": "Obesity class II",
  "obesity-3": "Obesity class III",
}

export type BsaFormula = "mosteller" | "du-bois" | "haycock"

/**
 * Body surface area in square metres. Mosteller is the common default; Du
 * Bois is the historical reference; Haycock is often used in children.
 */
export function bodySurfaceArea(
  weightKg: number,
  heightCm: number,
  formula: BsaFormula = "mosteller"
) {
  switch (formula) {
    case "du-bois":
      return 0.007184 * weightKg ** 0.425 * heightCm ** 0.725
    case "haycock":
      return 0.024265 * weightKg ** 0.5378 * heightCm ** 0.3964
    default:
      return Math.sqrt((weightKg * heightCm) / 3600)
  }
}
