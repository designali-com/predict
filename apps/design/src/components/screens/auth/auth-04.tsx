"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Verify OTP"

const LENGTH = 6

// Figma: iPhone 18 Pro - 125 (1733:2003)
export default function Auth04() {
  const [digits, setDigits] = React.useState<string[]>(() => Array(LENGTH).fill(""))
  const refs = React.useRef<(HTMLInputElement | null)[]>([])

  const update = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1)
    setDigits((prev) => prev.map((d, i) => (i === index ? digit : d)))
    if (digit && index < LENGTH - 1) refs.current[index + 1]?.focus()
  }

  const onKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  return (
    <Screen className="items-center">
      <AppGlow variant="blob" />

      <PredictMark aria-label="PREDICT" className="relative mt-[82px] h-[72px] w-16 text-app-accent" />

      <div className="relative mt-[105px] text-center">
        <h1 className="font-display text-[40px] leading-[52px] font-normal">Enter OTP</h1>
        <p className="text-base">
          We have you an email at sent
          <br />
          +91 95679 48473
        </p>
      </div>

      <div className="relative mt-[64px] flex" role="group" aria-label="One-time password">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            value={digit}
            onChange={(e) => update(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            placeholder="0"
            aria-label={`Digit ${i + 1}`}
            className="size-12 rounded-full border border-app-border bg-app-field text-center text-sm text-app-foreground outline-none placeholder:text-app-foreground focus-visible:border-app-accent focus-visible:ring-2 focus-visible:ring-app-accent/20"
          />
        ))}
      </div>

      <div className="relative mt-[118px] flex flex-col gap-3">
        <Button variant="app" size="lg" className="w-[290px] px-7 text-base">
          Submit
        </Button>
        <Button variant="app-secondary" size="lg" className="w-[290px] px-6 text-sm">
          Use different number
        </Button>
      </div>

      <a href="#" className="relative mt-[35px] text-base text-white underline">
        resend otp?
      </a>
    </Screen>
  )
}
