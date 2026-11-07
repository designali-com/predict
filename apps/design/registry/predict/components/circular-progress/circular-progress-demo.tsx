"use client"

import * as React from "react"

import { CircularProgressCombined } from "@workspace/ui/components/circular-progress"

export function CircularProgressDemo() {
  const [value, setValue] = React.useState(13)

  React.useEffect(() => {
    const timer = setTimeout(() => setValue(66), 500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <CircularProgressCombined value={value} aria-label="Uploading results" />
  )
}
