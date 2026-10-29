"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

const units = {
  conventional: "mg/dL",
  si: "mmol/L",
}

export function DropdownMenuRadio() {
  const [unit, setUnit] = React.useState<keyof typeof units>("conventional")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Units: {units[unit]}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Units</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={unit}
            onValueChange={(value) => setUnit(value as keyof typeof units)}
          >
            <DropdownMenuRadioItem value="conventional">
              Conventional (mg/dL)
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="si">SI (mmol/L)</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
