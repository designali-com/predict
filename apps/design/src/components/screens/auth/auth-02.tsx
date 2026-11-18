import { PhoneIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Welcome"

// Figma: iPhone 18 Pro - 121 (1733:1930)
export default function Auth02() {
  return (
    <Screen className="items-center">
      <AppGlow variant="blob" />

      <PredictMark aria-label="PREDICT" className="relative mt-[82px] h-[72px] w-16 text-app-accent" />

      <div className="relative mt-[306px] text-center">
        <h1 className="font-display text-[40px] leading-[52px] font-normal">Welcome</h1>
        <p className="text-base">Your journey starts with here</p>
      </div>

      <div className="relative mt-12 flex flex-col gap-3">
        <Button variant="app" size="lg" className="w-[290px] px-7 text-base">
          Continue with Phone
          <PhoneIcon className="size-[13px] fill-current stroke-0" />
        </Button>
        <Button variant="app-secondary" size="lg" className="w-[290px] px-6 text-sm">
          Continue with Apple
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screens/shared/apple.svg" alt="" className="size-3.5" />
        </Button>
      </div>

      <p className="relative mt-[35px] text-base text-white">
        Don’t have an account?{" "}
        <a href="#" className="underline">
          sign up
        </a>
      </p>
    </Screen>
  )
}
