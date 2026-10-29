"use client"

import { Input } from "@workspace/ui/components/input"

const sizes = ["sm", "default", "lg"] as const

export function InputSizes() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {sizes.map((size) => (
        <Input key={size} size={size} placeholder={size} aria-label={`Input, ${size}`} />
      ))}
    </div>
  )
}
