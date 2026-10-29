"use client"

import { Logo } from "@workspace/ui/predict/logo"

export function LogoColor() {
  return (
    <div className="flex flex-col items-center gap-6">
      <Logo aria-label="PREDICT" role="img" className="text-foreground h-50 w-auto" />
      <Logo aria-label="PREDICT" role="img" className="text-primary h-50 w-auto" />
      <Logo aria-label="PREDICT" role="img" className="text-secondary h-50 w-auto" />
    </div>
  )
}
