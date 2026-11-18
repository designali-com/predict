import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Enter phone number"

// Figma: iPhone 18 Pro - 124 (1733:1984)
export default function Auth03() {
  return (
    <Screen className="items-center">
      <AppGlow variant="blob" />

      <PredictMark aria-label="PREDICT" className="relative mt-[82px] h-[72px] w-16 text-app-accent" />

      <div className="relative mt-[69px] flex flex-col items-center text-center">
        <h1 className="w-[248px] font-display text-[40px] leading-[1.1] font-normal">
          What&apos;s your number?
        </h1>
        <p className="mt-1.5 text-base">The one you gave at your blood test.</p>
      </div>

      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        size="lg"
        placeholder="Phone number"
        aria-label="Phone number"
        className="relative mt-[77px] w-[290px] border-app-border bg-app-field text-sm text-app-foreground placeholder:text-app-foreground/40"
      />

      <div className="relative mt-[118px] flex flex-col gap-3">
        <Button variant="app" size="lg" className="w-[290px] px-7 text-base">
          Submit
        </Button>
        <Button variant="app-secondary" size="lg" className="w-[290px] px-6 text-sm">
          Use different number
        </Button>
      </div>

      <a href="#" className="relative mt-[35px] text-base text-white underline">
        resend otp?
      </a>
    </Screen>
  )
}
