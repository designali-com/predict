import { Button } from "@workspace/ui/components/button"
import { AppCard } from "@workspace/ui/predict/app/app-card"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Is this you?"

// Figma: iPhone 18 Pro - 137 (1733:3693)
export default function Registered01() {
  return (
    <Screen className="items-center">
      <AppGlow variant="blob" />

      <PredictMark className="relative mt-[82px] h-[72px] w-16 text-app-accent" />

      <h1 className="relative mt-[78px] w-[248px] text-center font-display text-[40px] leading-[1.1] font-normal">
        Is this you?
      </h1>
      <p className="relative mt-[11px] text-base leading-[19px]">From your lab booking.</p>

      <AppCard className="mt-[43px] h-[274px] w-[247px] items-center">
        <div className="relative size-[133px] shrink-0 overflow-hidden rounded-full bg-app-pill">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/screens/shared/avatar.png"
            alt="Arjun Vaidya"
            className="absolute top-[-46.55px] left-[-37.73px] h-[343.6px] w-[192.94px] max-w-none"
          />
        </div>
        <div className="flex flex-col items-center gap-1.5 text-center">
          <p className="font-display text-2xl leading-7">Arjun Vaidya</p>
          <p className="text-sm leading-4">Apollo Diagnostics · 12 Nov</p>
        </div>
      </AppCard>

      <div className="relative mt-[42px] flex flex-col gap-3">
        <Button variant="app" size="lg" className="w-[290px] text-base">
          Yes, that&apos;s me
        </Button>
        <Button variant="app-secondary" size="lg" className="w-[290px] px-6 text-sm">
          Edit details
        </Button>
      </div>
    </Screen>
  )
}
