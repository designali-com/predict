"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const clinics = [
  { label: "Select a clinic", value: null },
  { label: "London Bridge", value: "london-bridge" },
  { label: "Manchester", value: "manchester" },
  { label: "Edinburgh", value: "edinburgh" },
]

export function SelectPlaceholder() {
  return (
    <Select items={clinics}>
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {clinics
          .filter((item) => item.value !== null)
          .map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}
