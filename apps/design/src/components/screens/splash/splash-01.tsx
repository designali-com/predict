import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Splash · dark"

// Figma: iPhone 18 Pro - 117 (1733:1862)
export default function Splash01() {
  return (
    <Screen className="items-center bg-black">
      <PredictMark aria-label="PREDICT" className="mt-[378px] h-[119px] w-[106px] text-app-accent" />
    </Screen>
  )
}
