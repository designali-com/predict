import { biomarkerRange, getBiomarker } from "@workspace/ui/lib/biomarkers"
import { ReferenceRange } from "@workspace/ui/tools/reference-range"

/** A biomarker's reference range card in docs, looked up by id. */
export function BiomarkerRange({ id, value }: { id: string; value: number }) {
  const biomarker = getBiomarker(id)
  if (!biomarker) throw new Error(`Unknown biomarker "${id}"`)

  return (
    <div className="flex justify-center rounded-lg p-6">
      <ReferenceRange
        name={biomarker.abbreviation}
        description={biomarker.name}
        value={value}
        unit={biomarker.unit}
        range={biomarkerRange(biomarker)}
      />
    </div>
  )
}
