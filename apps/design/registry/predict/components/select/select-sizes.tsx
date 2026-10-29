"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const ranges = [
  { label: "Last 30 days", value: "30d" },
  { label: "Last 6 months", value: "6m" },
  { label: "All time", value: "all" },
]

export function SelectSizes() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Select items={ranges} defaultValue="6m">
        <SelectTrigger size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ranges.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select items={ranges} defaultValue="6m">
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ranges.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
