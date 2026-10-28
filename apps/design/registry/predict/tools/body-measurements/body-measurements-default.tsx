"use client"

import { BodyMeasurements } from "@workspace/ui/tools/body-measurements"

export function BodyMeasurementsDefault() {
  return (
    <div className="mx-auto flex w-full justify-center">
      <BodyMeasurements defaultWeight={60} defaultHeight={165} />
    </div>
  )
}
