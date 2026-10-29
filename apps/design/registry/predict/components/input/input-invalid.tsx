"use client"

import { Input } from "@workspace/ui/components/input"

export function InputInvalid() {
  return (
    <div className="grid w-full max-w-sm gap-1.5 text-xs font-medium">
      <label className="grid gap-1.5">
        Phone
        <Input
          type="tel"
          defaultValue="12345"
          aria-invalid
          aria-describedby="phone-error"
        />
      </label>
      <span id="phone-error" className="font-normal text-destructive">
        Enter a 10 digit number.
      </span>
    </div>
  )
}
