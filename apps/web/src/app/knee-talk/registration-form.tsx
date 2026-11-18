"use client"

import { useState } from "react"
import { ArrowRight, CalendarDays, CircleCheck, Clock, Loader2, Mail, Phone, User } from "lucide-react"

const YEARS = ["Less than 1 year", "1–3 years", "3–5 years", "5–10 years", "10+ years"]

const input =
  "block h-12 w-full rounded-xl border border-[#d9dfd9] bg-white ps-11 pe-3 text-base text-[#0f1a14] outline-none transition placeholder:text-[#9aa59e] focus:border-[#133f26] focus:ring-4 focus:ring-[#133f26]/10"

export function RegistrationForm({ event }: { event: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle")
  const [error, setError] = useState("")
  const [years, setYears] = useState("")
  const [name, setName] = useState("")

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    if (!years) return setError("Please tell us how long you've had knee pain")
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    const utm = new URLSearchParams(window.location.search).get("utm_source")
    setState("sending")
    try {
      const res = await fetch("/api/public/event-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, years, event, ...(utm ? { utm_source: utm } : {}) }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error || "Something went wrong, please try again")
      setName(data.name?.trim().split(/\s+/)[0] ?? "")
      setState("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong, please try again")
      setState("idle")
    }
  }

  if (state === "done") {
    return (
      <div className="mt-5 flex flex-col items-center rounded-2xl bg-[#f1f6ee] px-5 py-7 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-[#133f26] text-white">
          <CircleCheck className="size-7" />
        </div>
        <p className="mt-4 text-lg font-semibold">You&apos;re registered{name ? `, ${name}` : ""}!</p>
        <p className="mt-1 text-sm text-[#5b6b61]">Your seat is reserved.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm font-medium">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-[#d9dfd9]">
            <CalendarDays className="size-4 text-[#133f26]" /> 12th November
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-[#d9dfd9]">
            <Clock className="size-4 text-[#133f26]" /> 6:00 PM
          </span>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4" noValidate={false}>
      <Field label="Full name">
        <Icon><User /></Icon>
        <input name="name" required autoComplete="name" placeholder="Your full name" className={input} />
      </Field>

      <Field label="Mobile number">
        <Icon><Phone /></Icon>
        <span className="pointer-events-none absolute inset-y-0 start-11 flex items-center text-base text-[#5b6b61]">+91</span>
        <input
          name="phone"
          required
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          pattern="[6-9][0-9]{9}"
          maxLength={10}
          placeholder="10-digit number"
          title="Enter a 10-digit mobile number"
          className={`${input} ps-[4.6rem] tabular-nums`}
        />
      </Field>

      <Field label="Email ID">
        <Icon><Mail /></Icon>
        <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={input} />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">How long have you had knee pain?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {YEARS.map((y) => {
            const on = years === y
            return (
              <button
                key={y}
                type="button"
                aria-pressed={on}
                onClick={() => setYears(y)}
                className={`h-10 rounded-full px-4 text-sm font-medium transition ${
                  on
                    ? "bg-[#133f26] text-white shadow-sm"
                    : "bg-white text-[#2b3a31] ring-1 ring-[#d9dfd9] hover:ring-[#133f26]/40"
                }`}
              >
                {y}
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Hidden from people; bots fill it. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      {error && <p className="rounded-lg bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">{error}</p>}

      <button
        type="submit"
        disabled={state === "sending"}
        className="group flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#133f26] text-base font-semibold text-white transition hover:bg-[#0e3020] active:scale-[0.99] disabled:opacity-70"
      >
        {state === "sending" ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Registering…
          </>
        ) : (
          <>
            Reserve my seat
            <ArrowRight className="size-5 transition group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </form>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-[#7a877f]">{hint}</span>}
      </span>
      <span className="relative mt-1.5 block">{children}</span>
    </label>
  )
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute inset-y-0 start-0 flex w-11 items-center justify-center text-[#7a877f] [&_svg]:size-[18px]">
      {children}
    </span>
  )
}
