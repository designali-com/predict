"use client"

import * as React from "react"
import {
  ArrowUpRightIcon,
  ChevronLeftIcon,
  CircleXIcon,
  FileTextIcon,
  PlayIcon,
  UploadIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  AppCard,
  AppCardDescription,
  AppCardHeader,
  AppCardTitle,
} from "@workspace/ui/predict/app/app-card"

import { Screen } from "../screen"

export const title = "Blood report attached"

// Figma: iPhone 18 Pro - 146 (1737:6003)
export default function UploadReport03() {
  const [fileName, setFileName] = React.useState<string | null>(
    "Arjun_Vadiya_Blood_Test_Report.pdf"
  )

  return (
    <Screen>
      <header className="flex items-center justify-between pt-[51px] pr-[47px] pl-10">
        <button type="button" aria-label="Back" className="flex size-6 items-center justify-center">
          <ChevronLeftIcon className="size-6" strokeWidth={1.5} />
        </button>
        <div className="size-[60px] shrink-0 overflow-hidden rounded-full border border-app-foreground bg-app-pill">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/screens/shared/avatar.png"
            alt="Arjun Vaidya"
            className="size-full object-cover object-top"
          />
        </div>
      </header>

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

      {/* Bottom sheet */}
      <AppCard
        role="dialog"
        aria-label="Upload your Blood Report"
        className="absolute top-[565px] left-px z-20 h-[625px] w-[401px] items-center bg-app-surface px-[30px] py-5 backdrop-blur-xl"
      >
        <div aria-hidden className="h-[7px] w-[149px] shrink-0 rounded-[3.5px] bg-app-accent/50" />
        <div className="flex flex-col items-center text-center">
          <AppCardTitle>Upload your Blood Report</AppCardTitle>
          <AppCardDescription className="w-[243px]">
            Get a clearer picture of your health with accurate blood testing and regular health
            monitoring.
          </AppCardDescription>
        </div>

        {fileName ? (
          <div className="flex h-12 w-full shrink-0 items-center rounded-[30px] border border-dashed border-app-accent bg-app-field/50">
            <div className="flex w-[247px] items-center justify-center gap-1.5">
              <FileTextIcon className="size-3.5" />
              <span className="truncate text-[10px] leading-[14px]">{fileName}</span>
            </div>
            <button
              type="button"
              aria-label="Remove file"
              onClick={() => setFileName(null)}
              className="ml-[53px] flex size-6 items-center justify-center"
            >
              <CircleXIcon className="size-6" strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <label className="flex h-12 w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[30px] border border-dashed border-app-accent bg-app-field/50">
            <input
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
            <UploadIcon className="size-3.5" />
            <span className="text-[10px] leading-[14px]">upload or drop here your pdf report</span>
          </label>
        )}

        <Button variant="app" size="lg" className="w-[321px] text-base" disabled={!fileName}>
          Continue
        </Button>
      </AppCard>
    </Screen>
  )
}
