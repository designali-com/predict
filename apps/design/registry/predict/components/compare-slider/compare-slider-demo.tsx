"use client"

import {
  CompareSlider,
  CompareSliderAfter,
  CompareSliderBefore,
  CompareSliderHandle,
} from "@workspace/ui/components/compare-slider"

function Panel({
  title,
  value,
  className,
}: {
  title: string
  value: string
  className?: string
}) {
  return (
    <div
      className={`flex size-full flex-col items-center justify-center gap-2 ${className ?? ""}`}
    >
      <span className="text-sm opacity-80">{title}</span>
      <span className="text-5xl font-semibold tabular-nums">{value}</span>
      <span className="text-sm opacity-80">Vitamin D, ng/mL</span>
    </div>
  )
}

export function CompareSliderDemo() {
  return (
    <CompareSlider
      defaultValue={50}
      className="h-64 w-full max-w-md rounded-lg border"
      aria-label="Compare results before and after supplements"
    >
      <CompareSliderBefore label="Before">
        <Panel title="January" value="18" className="bg-muted" />
      </CompareSliderBefore>
      <CompareSliderAfter label="After">
        <Panel
          title="June"
          value="42"
          className="bg-primary text-primary-foreground"
        />
      </CompareSliderAfter>
      <CompareSliderHandle />
    </CompareSlider>
  )
}
