"use client"

import { useEffect, useState } from "react"
import { FlaskConical, LogIn, X } from "lucide-react"

/**
 * The demo's two faces: a bar on every page saying it is a demo, and the
 * one-click sign-in on the login page. Both render nothing unless
 * NEXT_PUBLIC_DEMO_MODE=1, so the production build never shows them.
 */

export const DEMO_ON = process.env.NEXT_PUBLIC_DEMO_MODE !== "0"

/** The demo accounts' shared password — public on purpose; they only see fictional data. */
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "predict-demo-2026"

/** Where a visitor's "close" is remembered — this browser only. */
const DISMISS_KEY = "predict-demo-banner-dismissed"

export function DemoBanner() {
  // Hidden until we know: a visitor who closed it should not see it flash on
  // every page load before the remembered choice is read.
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      setShow(localStorage.getItem(DISMISS_KEY) !== "1")
    } catch {
      // Storage blocked (private window): show it; closing still works for the visit.
      setShow(true)
    }
  }, [])

  if (!DEMO_ON || !show) return null

  function dismiss() {
    setShow(false)
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // Not remembered, but gone for now.
    }
  }

  return (
    <div
      role="note"
      className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-[#8504FE] py-1.5 pl-4 pr-10 text-center text-xs font-medium text-white"
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      <span>
        Live demo — every patient, lead and payment here is fictional, and no message, email or upload leaves this
        site. It resets every night.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close the demo notice"
        title="Close"
        className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export interface DemoAccount {
  label: string
  email: string
  hint: string
}

/**
 * One button per demo role. `signIn` is the app's own (its auth client);
 * it returns an error message, or null when signed in.
 */
export function DemoSignIn({
  accounts,
  signIn,
  onDone,
}: {
  accounts: DemoAccount[]
  signIn: (email: string, password: string) => Promise<string | null>
  onDone: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!DEMO_ON) return null

  async function go(a: DemoAccount) {
    setBusy(a.email)
    setError(null)
    const problem = await signIn(a.email, DEMO_PASSWORD)
    if (problem) {
      setError(problem)
      setBusy(null)
      return
    }
    onDone()
  }

  return (
    <div className="w-full space-y-2 rounded-xl border border-[#8504FE]/30 bg-[#8504FE]/[0.06] p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <FlaskConical className="h-4 w-4 text-[#8504FE]" /> Try the demo
      </p>
      <p className="text-xs text-muted-foreground">Pick a role — no password needed. All data is fictional.</p>
      <div className="grid gap-2">
        {accounts.map((a) => (
          <button
            key={a.email}
            type="button"
            onClick={() => go(a)}
            disabled={!!busy}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:border-[#8504FE]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8504FE] disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="block font-medium">{a.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{a.hint}</span>
            </span>
            <LogIn className={`h-4 w-4 shrink-0 ${busy === a.email ? "animate-pulse text-[#8504FE]" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
