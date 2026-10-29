"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

export function DropdownMenuCheckboxes() {
  const [inRange, setInRange] = React.useState(true)
  const [borderline, setBorderline] = React.useState(true)
  const [outOfRange, setOutOfRange] = React.useState(true)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Filter results
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={inRange} onCheckedChange={setInRange}>
            In range
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={borderline}
            onCheckedChange={setBorderline}
          >
            Borderline
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={outOfRange}
            onCheckedChange={setOutOfRange}
          >
            Out of range
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
