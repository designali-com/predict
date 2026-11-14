"use client"

import { useEffect, useState } from "react"

export interface Me {
  id: string
  name: string | null
  role: string
  permissions: string[]
  /** Which forms this account fills in — receptionist / doctor / nutritionist. */
  formOwners: string[]
}

/**
 * Who is signed in, for panels that must not render for the wrong job.
 *
 * Fetched once per mount and shared through the module cache below, so three
 * panels on one page do not each ask. `null` while it is in flight — callers
 * render nothing rather than guessing, because guessing wrong flashes a fee box
 * at a doctor before taking it away again.
 */
let cached: Promise<Me | null> | null = null

function fetchMe(): Promise<Me | null> {
  cached ??= fetch("/api/staff/me")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  return cached
}

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    let live = true
    fetchMe().then((data) => live && setMe(data))
    return () => {
      live = false
    }
  }, [])

  return me
}
