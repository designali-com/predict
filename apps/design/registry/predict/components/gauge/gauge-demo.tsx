"use client"

import * as React from "react"

import { GaugeCombined } from "@workspace/ui/components/gauge"

export function GaugeDemo() {
  const [value, setValue] = React.useState(20)

  React.useEffect(() => {
    const timer = setTimeout(() => setValue(72), 500)
    return () => clearTimeout(timer)
  }, [])

  return <GaugeCombined value={value} aria-label="Health score" />
}
