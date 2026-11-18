"use client"

import { useCallback, useEffect, useState } from "react"
import { EmgBand, emgSupported, type EmgChunk } from "./band"

/**
 * Up to two EMG bands for the whole browser tab, as the band's dashboard runs
 * them (dashboard/js/devices.js, MAX_BLE = 2): one on the upper arm and one on
 * the forearm, or one on the thigh and one on the shank. Like the DynaMo the
 * links live outside React, so they survive moving between tabs and patients;
 * samples go straight from the notification to whoever subscribed (the live
 * scope, the recorder), tagged with the band they came from.
 */
export const MAX_BANDS = 2

export interface BandSlot {
  /** Stable for the life of the link — what samples are tagged with. */
  key: number
  band: EmgBand
  /** Where it is on the body: a cohort site (ua, fa, th, sh) or a protocol band (proximal, distal). */
  site: string | null
  state: "connected" | "reconnecting"
}

let slots: BandSlot[] = []
let connecting = false
let lastError: string | null = null
let nextKey = 1
const listeners = new Set<() => void>()
const sinks = new Set<(key: number, chunk: EmgChunk) => void>()
const notify = () => listeners.forEach((l) => l())

/** Receive every chunk every band sends until the returned function is called. */
export function subscribeEmg(sink: (key: number, chunk: EmgChunk) => void): () => void {
  sinks.add(sink)
  return () => {
    sinks.delete(sink)
  }
}

export function useEmgBands() {
  const [, setTick] = useState(0)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    setSupported(emgSupported())
    const l = () => setTick((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  /** Add a band: opens the chooser, so call it straight from a click. */
  const connect = useCallback(async (site: string | null = null) => {
    if (slots.length >= MAX_BANDS) {
      lastError = "Two bands are already connected. Disconnect one to pair a different band."
      return notify()
    }
    lastError = null
    connecting = true
    notify()
    const key = nextKey++
    const band = new EmgBand()
    band.onChunk = (chunk) => sinks.forEach((s) => s(key, chunk))
    band.onState = (s) => {
      const slot = slots.find((x) => x.key === key)
      if (!slot) return
      if (s === "lost") {
        slots = slots.filter((x) => x.key !== key)
        lastError = `${band.name} dropped out and did not come back. Check it is switched on and close by, then connect it again.`
      } else slot.state = s
      notify()
    }
    try {
      // requestDevice must run inside the click: nothing is awaited before it.
      await band.connect(slots.map((s) => s.band.id))
      slots = [...slots, { key, band, site, state: "connected" }]
    } catch (e) {
      const msg = e instanceof Error ? e.message : ""
      // Closing the chooser is not an error worth showing.
      lastError = /cancel|chosen|no band selected|User cancelled/i.test(msg) ? null : msg || "Could not connect the band."
      await band.disconnect().catch(() => undefined)
    } finally {
      connecting = false
      notify()
    }
  }, [])

  const disconnect = useCallback(async (key: number) => {
    const slot = slots.find((s) => s.key === key)
    slots = slots.filter((s) => s.key !== key)
    notify()
    await slot?.band.disconnect()
  }, [])

  const setSite = useCallback((key: number, site: string) => {
    // A site belongs to one band: the other band takes this one's old site.
    const mine = slots.find((s) => s.key === key)
    const other = slots.find((s) => s.key !== key && s.site === site)
    if (other && mine) other.site = mine.site
    if (mine) mine.site = site
    slots = [...slots]
    notify()
  }, [])

  const status = !supported ? ("unsupported" as const) : connecting ? ("connecting" as const) : ("ready" as const)
  const anyLinked = slots.length > 0

  // Keep the screen awake while a band is linked: a sleeping laptop drops it.
  useEffect(() => {
    if (!anyLinked || !("wakeLock" in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock) return
      try {
        const next = await navigator.wakeLock.request("screen")
        if (cancelled) return void next.release()
        lock = next
        next.addEventListener("release", () => {
          if (lock === next) lock = null
        })
      } catch {
        // Refused; the link still works.
      }
    }
    void acquire()
    document.addEventListener("visibilitychange", acquire)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", acquire)
      void lock?.release()
    }
  }, [anyLinked])

  return {
    slots,
    status,
    error: lastError,
    clearError: () => {
      lastError = null
      notify()
    },
    connect,
    disconnect,
    setSite,
  }
}
