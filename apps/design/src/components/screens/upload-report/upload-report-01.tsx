import { ArrowUpRightIcon, PlayIcon, UploadIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  AppCard,
  AppCardDescription,
  AppCardHeader,
  AppCardTitle,
} from "@workspace/ui/predict/app/app-card"
import { AppBottomNav } from "@workspace/ui/predict/app/app-bottom-nav"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { AppGreeting } from "@workspace/ui/predict/app/app-greeting"

import { Screen } from "../screen"

export const title = "Home · upload report"

// Figma: iPhone 18 Pro - 144 (1737:5741)
export default function UploadReport01() {
  return (
    <Screen>
      <AppGreeting name="Arjun Vaidya" avatarSrc="/screens/shared/avatar.png" />

      <div className="mt-[33px] flex flex-col gap-3 px-[10.5px]">
        <AppCard className="h-[297px] items-center px-2.5 pt-[30px] pb-2.5">
          <AppCardHeader className="w-[321px]">
            <AppCardTitle>Watch our product</AppCardTitle>
            <ArrowUpRightIcon className="size-6" />
          </AppCardHeader>
          <div className="relative h-[209px] w-[362px] overflow-hidden rounded-[30px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/screens/shared/product-video.png"
              alt="PREDICT product video"
              className="size-full object-cover"
            />
            <button
              type="button"
              aria-label="Play video"
              className="absolute inset-0 m-auto flex size-[78px] items-center justify-center text-white"
            >
              <PlayIcon className="size-8 fill-white" />
            </button>
          </div>
        </AppCard>

        <AppCard className="h-[176px]">
          <AppCardHeader>
            <div>
              <AppCardTitle>Upload your report</AppCardTitle>
              <AppCardDescription>
                Get a clearer picture of your health with accurate
              </AppCardDescription>
            </div>
          </AppCardHeader>
          <Button variant="app" size="lg" className="w-full gap-1 text-base">
            <UploadIcon className="size-[17px]" />
            Upload
          </Button>
        </AppCard>
      </div>

      <AppGlow variant="fade" />
      <AppBottomNav />
    </Screen>
  )
}
