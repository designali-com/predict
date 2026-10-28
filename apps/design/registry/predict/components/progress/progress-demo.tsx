"use client"

import * as React from "react"

import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@workspace/ui/components/progress"

export function ProgressDemo() {
  const [value, setValue] = React.useState(20)

  React.useEffect(() => {
    const timer = setTimeout(() => setValue(66), 500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Progress value={value} className="w-full max-w-sm">
      <ProgressLabel>Analysing your panel</ProgressLabel>
      <ProgressValue />
    </Progress>
  )
}
