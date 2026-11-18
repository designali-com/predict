import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Signing in"

// Figma: iPhone 18 Pro - 136 (1733:3143)
export default function Auth09() {
  return (
    <Screen className="items-center justify-center">
      <AppGlow variant="blob" />
      <PredictMark className="relative h-[72px] w-16 text-app-accent" />
    </Screen>
  )
}
