import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Signing in"

// Figma: iPhone 18 Pro - 127 (1733:2053)
export default function Auth05() {
  return (
    <Screen className="items-center">
      <AppGlow variant="blob" />
      <PredictMark aria-label="PREDICT" className="relative mt-[401px] h-[72px] w-16 text-app-accent" />
    </Screen>
  )
}
