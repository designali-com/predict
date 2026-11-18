import { PredictLoader } from "@workspace/ui/components/predict-loader"

// While the report's data loads: the Predict mark turning, as everywhere else.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EFEFEF]">
      <PredictLoader label="Preparing the health report…" />
    </div>
  )
}
