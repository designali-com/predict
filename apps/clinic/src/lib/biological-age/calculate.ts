export interface BiomarkerReadingInput {
  biomarkerId: string
  value: number
  rangeMin: number
  rangeMax: number
}

export interface DomainInput {
  domainId: string
  biomarkers: BiomarkerReadingInput[]
}

export interface CalculationInput {
  chronologicalAge: number
  k: number
  domains: DomainInput[]
}

export interface DomainResult {
  domainId: string
  meanAbsZ: number
  biomarkerCount: number
  weightUsed: number
  alphaUsed: number
  contribution: number
}

export interface CalculationResult {
  compositeScore: number
  deltaAge: number
  biologicalAge: number
  domainResults: DomainResult[]
}

/**
 * Pure biological-age calculation. No DB, no I/O — only the math.
 *
 * A biomarker only ever appears here if the caller found a recorded value for
 * it; a domain with zero biomarkers is dropped from the result entirely (it
 * contributes nothing to compositeScore or deltaAge). Every |Z| is taken as an
 * absolute value regardless of the biomarker's direction (Up/Down) — the
 * doctor's actual rule is "Up adds, Down subtracts", but this pass always adds
 * per explicit instruction, to be corrected once the direction logic is confirmed.
 *
 * W_d and α_d are derived from the domains' own Mean|Z|_d — confirmed against
 * the CBLAI reference sheet:
 *   W_d = Mean|Z|_d / Σ(Mean|Z|_d)                              (sums to 1.0)
 *   α_d = round(5 * (Mean|Z|_d − min(Mean|Z|_d)) / (max − min) + 1)  (1..6)
 * Both are computed fresh per calculation, relative to the other domains that
 * have data in that same run — they are not admin-configured constants.
 */
export function calculateBiologicalAge(input: CalculationInput): CalculationResult {
  const domainMeans = input.domains
    .filter((domain) => domain.biomarkers.length > 0)
    .map((domain) => {
      const absZScores = domain.biomarkers.map((biomarker) => {
        const mean = (biomarker.rangeMin + biomarker.rangeMax) / 2
        const sd = (biomarker.rangeMax - biomarker.rangeMin) / 4
        const z = (biomarker.value - mean) / sd
        return Math.abs(z)
      })

      const meanAbsZ =
        absZScores.reduce((sum, absZ) => sum + absZ, 0) / absZScores.length

      return { domainId: domain.domainId, meanAbsZ, biomarkerCount: domain.biomarkers.length }
    })

  if (domainMeans.length === 0) {
    return { compositeScore: 0, deltaAge: 0, biologicalAge: input.chronologicalAge, domainResults: [] }
  }

  const sumMeanAbsZ = domainMeans.reduce((sum, d) => sum + d.meanAbsZ, 0)
  const minMeanAbsZ = Math.min(...domainMeans.map((d) => d.meanAbsZ))
  const maxMeanAbsZ = Math.max(...domainMeans.map((d) => d.meanAbsZ))
  const spread = maxMeanAbsZ - minMeanAbsZ

  const domainResults: DomainResult[] = domainMeans.map((d) => {
    // Every marker sitting exactly at the middle of its range makes every
    // Mean|Z| zero, and W_d = 0/0 = NaN — which propagated all the way to a
    // saved biological age of NaN. That is the textbook-healthy patient, not
    // an edge case. Their deviation is zero, so their contribution is zero and
    // their biological age is their real age; the weights are undefined but
    // cannot matter, so they are split evenly.
    const weightUsed = sumMeanAbsZ === 0 ? 1 / domainMeans.length : d.meanAbsZ / sumMeanAbsZ
    // When every domain ties (or there's only one), the relative-severity
    // ranking alpha encodes is undefined — default to the low end (1) rather
    // than guessing a midpoint, pending confirmation.
    const alphaUsed = spread === 0 ? 1 : Math.round((5 * (d.meanAbsZ - minMeanAbsZ)) / spread + 1)
    const contribution = input.k * alphaUsed * d.meanAbsZ * weightUsed

    return {
      domainId: d.domainId,
      meanAbsZ: d.meanAbsZ,
      biomarkerCount: d.biomarkerCount,
      weightUsed,
      alphaUsed,
      contribution,
    }
  })

  const compositeScore = domainResults.reduce(
    (sum, d) => sum + d.meanAbsZ * d.weightUsed,
    0,
  )
  const deltaAge = domainResults.reduce((sum, d) => sum + d.contribution, 0)
  const biologicalAge = input.chronologicalAge + deltaAge

  return { compositeScore, deltaAge, biologicalAge, domainResults }
}
