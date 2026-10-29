"use client"

import * as React from "react"

import { Textarea } from "@workspace/ui/components/textarea"

const maxLength = 200

export function TextareaWithCount() {
  const [value, setValue] = React.useState("")

  return (
    <label className="grid w-full max-w-sm gap-1.5 text-xs font-medium">
      Symptoms
      <Textarea
        value={value}
        maxLength={maxLength}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Describe how you have been feeling."
      />
      <span className="text-end font-normal text-muted-foreground tabular-nums">
        {value.length}/{maxLength}
      </span>
    </label>
  )
}
