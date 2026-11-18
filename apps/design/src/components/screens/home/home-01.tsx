"use client"

import * as React from "react"
import { ArrowUpRightIcon } from "lucide-react"
import { cn } from "cn"

import { AppCard } from "@workspace/ui/predict/app/app-card"
import { AppBottomNav } from "@workspace/ui/predict/app/app-bottom-nav"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"

import { Screen } from "../screen"

export const title = "Home"

/** Weekday pills along the dial arc, positioned as in Figma (centre x, top, rotation). */
const days = [
  { id: "sun-prev", label: "S", x: -206.6, top: 102.51, box: 44.624, rotate: -54.58 },
  { id: "mon", label: "M", x: -147.95, top: 41.73, box: 44.322, rotate: -33.35 },
  { id: "tue", label: "T", x: -79.1, top: 7.22, box: 39.192, rotate: -15 },
  { id: "wed", label: "W", x: 4.04, top: 0.34, box: 32, rotate: 0 },
  { id: "thu", label: "T", x: 82.48, top: 8.4, box: 39.192, rotate: 15 },
  { id: "fri", label: "F", x: 153.93, top: 44.1, box: 43.713, rotate: 30 },
  { id: "sat", label: "S", x: 207.3, top: 102.91, box: 43.713, rotate: 60 },
]

function MiniChart({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-[81px] w-[174px] shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/screens/home/home-01-chart-axis.svg"
        alt=""
        className="absolute inset-[43.18%_6.84%_0.18%_1.67%] size-auto"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/screens/home/home-01-chart-grid.svg"
        alt=""
        className="absolute inset-[16.88%_6.84%_8.27%_1.67%] size-auto"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/screens/home/home-01-chart-line.svg"
        alt=""
        className="absolute inset-[13.79%_5.42%_5.18%_0.24%] size-auto"
      />
    </div>
  )
}

function MetricCard({
  title,
  subtitle,
  label,
  value,
  footnote,
  chartClassName,
  className,
}: {
  title: string
  subtitle: string
  label: string
  value: string
  footnote: string
  chartClassName?: string
  className?: string
}) {
  return (
    <AppCard className={cn("absolute left-1/2 -translate-x-1/2 gap-0 text-white", className)}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1.5">
          <p className="h-5 font-display text-sm leading-6">{title}</p>
          <p className="h-2.5 text-[10px] leading-2">{subtitle}</p>
        </div>
        <ArrowUpRightIcon className="size-6" strokeWidth={1} />
      </div>
      <div className="flex items-end gap-1.5">
        <div className="flex w-[90px] shrink-0 flex-col">
          <p className="text-sm leading-5">{label}</p>
          <p className="text-2xl leading-7 font-medium whitespace-nowrap">{value}</p>
          <p className="text-xs leading-4">{footnote}</p>
        </div>
        <MiniChart className={chartClassName} />
      </div>
    </AppCard>
  )
}

const statPill =
  "absolute flex h-8 items-center justify-between rounded-full bg-app-pill px-3 text-sm leading-5 whitespace-nowrap text-app-foreground"

// Figma: iPhone 18 Pro - 140 (1734:4658)
export default function Home01() {
  const [day, setDay] = React.useState("wed")

  return (
    <Screen>
      {/* Body figure: a soft blurred copy under the sharp render */}
      {["opacity-50 blur-[25px]", ""].map((layer, i) => (
        <div
          key={i}
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-[240.34px] left-[-38px] h-[684px] w-[479px] overflow-hidden",
            layer
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/screens/home/home-01-figure.png"
            alt=""
            className="absolute top-[-0.07%] left-[-35.07%] h-[178.51%] w-[169.94%] max-w-none"
          />
        </div>
      ))}

      {/* Week dial: tick-mark ring (gradient through an SVG mask) + day pills */}
      <div className="absolute top-[137px] left-[-50px] h-[518.75px] w-[503px]">
        <div
          aria-hidden
          className="absolute top-[-8.4px] left-[1.05px] h-[376.99px] w-[501.95px] bg-gradient-to-b from-app-accent to-app-accent/0"
          style={{
            maskImage: "url(/screens/home/home-01-dial-mask.svg)",
            maskPosition: "-2.05px 23.151px",
            maskSize: "505px 505px",
            maskRepeat: "no-repeat",
            maskMode: "alpha",
          }}
        />
        <div className="absolute top-0 left-[22.05px] h-[146.84px] w-[457.83px]">
          {days.map((d) => (
            <div
              key={d.id}
              className="absolute flex -translate-x-1/2 items-center justify-center"
              style={{
                left: `calc(50% + ${d.x}px)`,
                top: d.top,
                width: d.box,
                height: d.box,
              }}
            >
              <button
                type="button"
                aria-pressed={day === d.id}
                onClick={() => setDay(d.id)}
                style={{ rotate: `${d.rotate}deg` }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-[10.5px] leading-[21px] text-app-foreground",
                  day === d.id ? "bg-app-pill" : "border border-app-border bg-app-field"
                )}
              >
                {d.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Greeting */}
      <header className="relative flex items-start justify-between px-[47px] pt-[51px]">
        <div className="font-display">
          <p className="text-base leading-[13px]">Good Morning,</p>
          <h1 className="text-4xl leading-[44px] font-normal">Rohan</h1>
        </div>
        <div className="relative size-[60px] shrink-0 overflow-hidden rounded-full bg-app-pill">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/screens/shared/avatar.png"
            alt="Rohan"
            className="absolute top-[-21px] left-[-17.02px] h-[155px] w-[87.04px] max-w-none"
          />
        </div>
      </header>

      {/* Peeking card behind the bottom nav */}
      <MetricCard
        title="Next up"
        subtitle="Log your weight"
        label="Log"
        value="38%"
        footnote="HRV 62 ms"
        chartClassName="-scale-y-100"
        className="top-[761px] w-[381px] p-6 blur-[5px]"
      />

      <AppGlow variant="blob" />

      <div className={cn(statPill, "top-[458px] left-[244px] w-[135px]")}>
        <span>Muscle Age</span>
        <span>34</span>
      </div>
      <div className={cn(statPill, "top-[539px] left-[26px] w-[134px]")}>
        <span>Twin Age</span>
        <span>56</span>
      </div>

      <MetricCard
        title="Readiness"
        subtitle="You're well recovered."
        label="Slept"
        value="7 h 40m"
        footnote="HRV 62 ms"
        chartClassName="-scale-x-100"
        className="top-[605px] w-[311px] rounded-[24px] p-4"
      />

      <AppBottomNav />
    </Screen>
  )
}
