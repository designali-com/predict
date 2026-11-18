import { Button } from "@workspace/ui/components/button"

import { Screen } from "../screen"
import { WearablesDeviceCard, WearablesHeader, WearablesSheet } from "./wearables-02"

export const title = "Add a wearable · pair Apple Watch"

// Figma: iPhone 18 Pro - 143 (1737:5563)
export default function Wearables03() {
  return (
    <Screen>
      <WearablesHeader />
      <WearablesDeviceCard />

      <WearablesSheet title="Apple Watch" className="top-[372px] h-[616px]">
        {/* Watch render cropped from the pairing image and clipped to the watch silhouette. */}
        <div
          className="relative h-[252px] w-[150.5px] shrink-0 overflow-hidden"
          style={{
            maskImage: "url(/screens/wearables/apple-watch-mask.svg)",
            maskSize: "152.731px 254.01px",
            maskPosition: "-0.378px 1.049px",
            maskRepeat: "no-repeat",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/screens/wearables/apple-watch-pairing.png"
            alt="Apple Watch showing the pairing screen"
            className="absolute top-[-105.34%] left-[-154.98%] h-[205.34%] w-[254.98%] max-w-none"
          />
        </div>
        <Button variant="app" size="lg" className="w-[321px] text-base">
          Continue
        </Button>
      </WearablesSheet>
    </Screen>
  )
}
