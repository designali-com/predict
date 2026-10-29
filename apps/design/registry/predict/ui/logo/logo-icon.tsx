"use client"

import { LogoIcon } from "@workspace/ui/predict/logo"

export function LogoIconDemo() {
  return (
    <div className="flex items-end gap-6">
      <LogoIcon aria-hidden className="size-4" />
      <LogoIcon aria-hidden className="size-8" />
      <LogoIcon aria-label="PREDICT" role="img" className="size-12" />
    </div>
  )
}
