"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Verify email"

const LENGTH = 6

// Figma: iPhone 18 Pro - 126 (1733:2028)
export default function Auth08() {
  const [code, setCode] = React.useState<string[]>(() => Array(LENGTH).fill(""))
  const refs = React.useRef<(HTMLInputElement | null)[]>([])

  const update = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1)
    setCode((prev) => prev.map((d, i) => (i === index ? digit : d)))
    if (digit && index < LENGTH - 1) refs.current[index + 1]?.focus()
  }

  const onKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
  }

  return (
    <Screen className="items-center">
      <AppGlow variant="blob" />

      <PredictMark className="relative mt-[82px] h-[72px] w-16 text-app-accent" />

      <h1 className="relative mt-[105px] font-display text-[40px] leading-[52px] font-normal">
        Verify
      </h1>
      <p className="relative text-center text-base leading-[19px]">
        We have you an email at sent
        <br />
        ali@preditc.fit
      </p>

      <div className="relative mt-16 flex" role="group" aria-label="One-time code">
        {code.map((digit, i) => (
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
            maxLength={2}
            placeholder="0"
            aria-label={`Digit ${i + 1}`}
            className="size-12 rounded-full border border-app-border bg-transparent text-center text-sm leading-5 text-app-foreground outline-none placeholder:text-app-foreground focus-visible:border-app-accent"
          />
        ))}
      </div>

      <div className="relative mt-[118px] flex flex-col gap-3">
        <Button variant="app" size="lg" className="w-[290px] text-base">
          Submit
        </Button>
        <Button variant="app-secondary" size="lg" className="w-[290px] px-6 text-sm">
          Use different number
        </Button>
      </div>

      <button type="button" className="relative mt-[35px] text-base leading-[19px] text-white underline">
        resend otp?
      </button>
    </Screen>
  )
}
