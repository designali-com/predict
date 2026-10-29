"use client"

import { Button } from "@workspace/ui/components/button"
import { PredictLoader } from "@workspace/ui/predict/loader"

export function LoaderButton() {
  return (
    <Button variant="outline" disabled>
      <PredictLoader size={16} aria-hidden role={undefined} data-icon="inline-start" />
      Analysing results
    </Button>
  )
}
