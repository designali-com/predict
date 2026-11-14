"use client"

import { useEffect, useState } from "react"

/** WhatsApp lets us send free text for 24 hours after their last message. */
export const WINDOW_MS = 24 * 60 * 60 * 1000

/** How often an open chat asks the server for a new reply. */
export const LIVE_POLL_MS = 2_000

export function windowRemaining(lastInboundAt: string | null | undefined, now: number): number | null {
  if (!lastInboundAt) return null
  const left = new Date(lastInboundAt).getTime() + WINDOW_MS - now
  return left > 0 ? left : null
}

export function latestInboundAt(messages: { direction: string; createdAt: string }[]): string | null {
  let latest: string | null = null
  for (const m of messages) {
    if (m.direction !== "inbound") continue
    if (!latest || m.createdAt > latest) latest = m.createdAt
  }
  return latest
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** One clock for every badge on the page, so they tick together. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function WindowBadge({
  lastInboundAt,
  now,
}: {
  lastInboundAt: string | null | undefined
  now: number
}) {
  const left = windowRemaining(lastInboundAt, now)
  if (left == null) return null
  return (
    <span
      title="24-hour window is open. A new message from them starts the 24 hours again."
      className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-emerald-700 dark:text-emerald-300"
    >
      24h {formatCountdown(left)}
    </span>
  )
}
