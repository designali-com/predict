"use client"

import {
  CompareSlider,
  CompareSliderAfter,
  CompareSliderBefore,
  CompareSliderHandle,
} from "@workspace/ui/components/compare-slider"

export function CompareSliderHover() {
  return (
    <CompareSlider
      interaction="hover"
      className="h-56 w-full max-w-md rounded-lg border"
      aria-label="Compare light and dark theme"
    >
      <CompareSliderBefore label="Light">
        <div className="flex size-full items-center justify-center bg-white text-2xl font-semibold text-black">
          Predict
        </div>
      </CompareSliderBefore>
      <CompareSliderAfter label="Dark">
        <div className="flex size-full items-center justify-center bg-black text-2xl font-semibold text-white">
          Predict
        </div>
      </CompareSliderAfter>
      <CompareSliderHandle />
    </CompareSlider>
  )
}
