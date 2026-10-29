"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const sexes = [
  { label: "Female", value: "female" },
  { label: "Male", value: "male" },
  { label: "Intersex", value: "intersex" },
]

export function SelectDemo() {
  return (
    <Select items={sexes} defaultValue="female">
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {sexes.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
