"use client"

import * as React from "react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const groups = [
  {
    label: "Lipids",
    items: [
      { label: "LDL-C", value: "ldl-c" },
      { label: "HDL-C", value: "hdl-c" },
      { label: "Triglycerides", value: "triglycerides" },
    ],
  },
  {
    label: "Metabolic",
    items: [
      { label: "HbA1c", value: "hba1c" },
      { label: "Fasting glucose", value: "fbs" },
    ],
  },
]

const items = groups.flatMap((group) => group.items)

export function SelectGroups() {
  return (
    <Select items={items} defaultValue="ldl-c">
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group, index) => (
          <React.Fragment key={group.label}>
            {index > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel>{group.label}</SelectLabel>
              {group.items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </React.Fragment>
        ))}
      </SelectContent>
    </Select>
  )
}
