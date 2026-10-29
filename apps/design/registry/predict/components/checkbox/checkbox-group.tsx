"use client"

import * as React from "react"

import { Checkbox } from "@workspace/ui/components/checkbox"

const panels = [
  { id: "lipids", label: "Lipids" },
  { id: "metabolic", label: "Metabolic" },
  { id: "kidney", label: "Kidney" },
  { id: "inflammation", label: "Inflammation" },
]

export function CheckboxGroup() {
  const [selected, setSelected] = React.useState<string[]>(["lipids"])

  const allChecked = selected.length === panels.length
  const someChecked = selected.length > 0 && !allChecked

  return (
    <div className="grid w-full max-w-xs gap-3 text-xs">
      <label className="flex items-center gap-2 font-medium">
        <Checkbox
          checked={allChecked}
          indeterminate={someChecked}
          onCheckedChange={(checked) =>
            setSelected(checked ? panels.map((panel) => panel.id) : [])
          }
        />
        All panels
      </label>
      <div className="grid gap-3 ps-6">
        {panels.map((panel) => (
          <label key={panel.id} className="flex items-center gap-2">
            <Checkbox
              checked={selected.includes(panel.id)}
              onCheckedChange={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...current, panel.id]
                    : current.filter((id) => id !== panel.id)
                )
              }
            />
            {panel.label}
          </label>
        ))}
      </div>
    </div>
  )
}
