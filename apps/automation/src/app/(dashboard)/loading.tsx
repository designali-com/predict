import { PredictLoader } from "@/src/components/predict-loader"

export default function DashboardLoading() {
  // Centred in the whole space under the header, like each page's own loader.
  return (
    <div className="flex min-h-[calc(100svh-var(--header-height)-4rem)] w-full items-center justify-center">
      <PredictLoader className="py-0" />
    </div>
  )
}
