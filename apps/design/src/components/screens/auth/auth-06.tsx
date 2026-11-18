import { PhoneIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Welcome"

// Figma: iPhone 18 Pro - 122 (1733:1947)
export default function Auth06() {
  return (
    <Screen className="items-center">
      <AppGlow variant="blob" />

      <PredictMark className="relative mt-[82px] h-[72px] w-16 text-app-accent" />

      <h1 className="relative mt-[306px] font-display text-[40px] leading-[52px] font-normal">
        Welcome
      </h1>
      <p className="relative text-base leading-[19px]">Your journey starts with here</p>

      <div className="relative mt-12 flex flex-col gap-3">
        <Button variant="app" size="lg" className="w-[290px] gap-1 text-base">
          Continue with Phone
          <PhoneIcon className="size-[13px] fill-current" strokeWidth={0} />
        </Button>
        <Button variant="app-secondary" size="lg" className="w-[290px] gap-1 px-6 text-sm">
          Continue with Apple
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screens/shared/apple.svg" alt="" className="size-3.5" />
        </Button>
      </div>

      <p className="relative mt-[35px] flex gap-1.5 text-base leading-[19px] text-white">
        Already have an account?
        <a href="#" className="underline">
          login
        </a>
      </p>
    </Screen>
  )
}
