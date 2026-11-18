// Converts a lab report's biomarker value into the unit the superadmin
// configured for that biomarker in `biomarker.unit`, before it's saved and
// fed into the biological-age calculation (which assumes every reading is
// already in the configured unit).
//
// Only pure mass/volume concentration conversions are performed (ng/mL <->
// pg/mL, mg/dL <-> mg/L, etc — these differ only by a fixed power-of-ten
// factor). Activity units (U/L, IU/L) and molar concentrations (µmol/L,
// nmol/L) are a different physical quantity: turning a mass concentration
// into either requires assay-specific calibration or the analyte's
// molecular weight, which we don't have. Those pairs are deliberately left
// unconverted rather than silently producing a wrong number — callers must
// treat `converted: false` with a `reason` as "do not use this value".

type MassPrefix = "g" | "mg" | "ug" | "ng" | "pg";
const MASS_TO_GRAMS: Record<MassPrefix, number> = {
  g: 1,
  mg: 1e-3,
  ug: 1e-6,
  ng: 1e-9,
  pg: 1e-12,
};

type VolumeUnit = "L" | "dL" | "mL" | "uL";
const VOLUME_TO_LITERS: Record<VolumeUnit, number> = {
  L: 1,
  dL: 0.1,
  mL: 1e-3,
  uL: 1e-6,
};

interface ParsedConcentrationUnit {
  mass: MassPrefix;
  volume: VolumeUnit;
}

function normalizeLabel(unit: string): string {
  return unit
    .trim()
    .replace(/µ/g, "u")
    .replace(/mcg/i, "ug")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseMassConcentrationUnit(unit: string): ParsedConcentrationUnit | null {
  const match = /^(g|mg|ug|ng|pg)\/(l|dl|ml|ul)$/.exec(normalizeLabel(unit));
  if (!match) return null;

  const mass = match[1] as MassPrefix;
  const volume = { l: "L", dl: "dL", ml: "mL", ul: "uL" }[match[2] as string] as VolumeUnit;

  return { mass, volume };
}

export interface UnitConversionResult {
  value: number;
  converted: boolean;
  reason?: string;
}

export function convertConcentration(
  value: number,
  fromUnit: string,
  toUnit: string,
): UnitConversionResult {
  if (normalizeLabel(fromUnit) === normalizeLabel(toUnit)) {
    return { value, converted: false };
  }

  const fromParsed = parseMassConcentrationUnit(fromUnit);
  const toParsed = parseMassConcentrationUnit(toUnit);

  if (!fromParsed || !toParsed) {
    return {
      value,
      converted: false,
      reason: `Cannot convert "${fromUnit}" to "${toUnit}" — not a recognized mass/volume concentration pair (likely an activity unit like U/L or a molar unit like µmol/L, which needs assay-specific or molecular-weight data)`,
    };
  }

  const fromGramsPerLiter = MASS_TO_GRAMS[fromParsed.mass] / VOLUME_TO_LITERS[fromParsed.volume];
  const toGramsPerLiter = MASS_TO_GRAMS[toParsed.mass] / VOLUME_TO_LITERS[toParsed.volume];

  return { value: (value * fromGramsPerLiter) / toGramsPerLiter, converted: true };
}
