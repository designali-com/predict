import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Splash · light"

// Figma: iPhone 18 Pro - 118 (1733:1867)
export default function Splash02() {
  return (
    <Screen className="items-center">
      <PredictMark aria-label="PREDICT" className="mt-[378px] h-[119px] w-[106px] text-app-accent" />
    </Screen>
  )
}
