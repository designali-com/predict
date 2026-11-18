"use client"

import { useEffect, useState } from "react"
import { VALD_TESTS, type ValdTestDef } from "@workspace/db/vald-catalog"

/**
 * The clinic's DynaMo test catalogue (vald_test_type), for the runner and the
 * prescription form.
 *
 * Fetched once per page load and shared: the runner and the form on the same
 * page ask for it together. Until it arrives — or if it cannot be had — the
 * original short list stands in, so the runner never opens empty.
 */
let cached: ValdTestDef[] | null = null
let pending: Promise<ValdTestDef[]> | null = null

function load(): Promise<ValdTestDef[]> {
  pending ??= fetch("/api/staff/vald/tests")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const tests: ValdTestDef[] = Array.isArray(d?.tests) && d.tests.length ? d.tests : VALD_TESTS
      cached = tests
      return tests
    })
    .catch(() => {
      pending = null
      return VALD_TESTS
    })
  return pending
}

/** Forget the cached list — after a test was edited in settings. */
export function refreshValdTests() {
  cached = null
  pending = null
}

export function useValdTests(): { tests: ValdTestDef[]; byKey: (key: string) => ValdTestDef | undefined } {
  const [tests, setTests] = useState<ValdTestDef[]>(cached ?? VALD_TESTS)
  useEffect(() => {
    let live = true
    void load().then((t) => live && setTests(t))
    return () => {
      live = false
    }
  }, [])
  return { tests, byKey: (key: string) => tests.find((t) => t.key === key) ?? VALD_TESTS.find((t) => t.key === key) }
}

/** A Vimeo or YouTube page link, as the address an <iframe> plays. */
export function embedUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const vimeo = u.hostname.endsWith("vimeo.com") && u.pathname.match(/(\d{6,})/)
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v") ?? u.pathname.split("/embed/")[1]
      if (id) return `https://www.youtube.com/embed/${id}`
    }
    if (u.hostname === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    return u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

/** A direct video file (the clinic's own upload) plays in <video>, not an <iframe>. */
export const isVideoFile = (url: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)
