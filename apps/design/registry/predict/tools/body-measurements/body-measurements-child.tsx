"use client"

import { BodyMeasurements } from "@workspace/ui/tools/body-measurements"

export function BodyMeasurementsChild() {
  return (
    <div className="mx-auto flex w-full justify-center">
      <BodyMeasurements defaultWeight={20} defaultHeight={110} />
    </div>
  )
}
