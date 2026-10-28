"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

export function InputWithButton() {
  return (
    <form className="flex w-full max-w-sm items-center gap-2">
      <Input type="text" placeholder="Promo code" aria-label="Promo code" />
      <Button type="submit" size={"lg"}>
        Apply
      </Button>
    </form>
  )
}
