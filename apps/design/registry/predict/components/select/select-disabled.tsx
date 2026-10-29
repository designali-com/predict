"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const panels = [
  { label: "Core panel", value: "core" },
  { label: "Advanced panel", value: "advanced" },
  { label: "Genetic panel", value: "genetic" },
]

export function SelectDisabled() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Select items={panels} defaultValue="core" disabled>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {panels.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select items={panels} defaultValue="core">
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {panels.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value}
              disabled={item.value === "genetic"}
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
