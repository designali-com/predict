"use client"

import { useCallback, useEffect, useState } from "react"
import { DynaMo, isSupported } from "./device"

/**
 * One DynaMo for the whole browser tab.
 *
 * Module-level rather than component state so the link survives moving
 * between tabs and from one patient to the next: the Bluetooth chooser is a
 * click and a wait, and a clinic testing several people should pay it once.
 *
 * Three things keep the link up:
 *  - the device's own heartbeat (KeepTestAlive every few seconds, see device.ts);
 *  - a screen wake lock while connected, because a laptop that sleeps stops the
 *    heartbeat and the DynaMo drops the link a few seconds later;
 *  - reconnecting by itself when the link drops anyway (range, a wall, a
 *    radio hiccup) — to the same device, with no chooser — unless the device
 *    said it was being switched off.
 *
 * A page reload still ends it: the browser drops every GATT link on reload.
 */
let shared: DynaMo | null = null
let lastError: string | null = null
let reconnecting = false
/** When the load cell was last zeroed on this connection. Cleared on any reconnect. */
let zeroedAt: number | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

const RETRY_MS = [1000, 2000, 4000, 8000]

async function reconnectLoop(d: DynaMo) {
  reconnecting = true
  zeroedAt = null
  notify()
  for (const wait of RETRY_MS) {
    await new Promise((r) => setTimeout(r, wait))
    if (shared !== d) return // disconnected on purpose, or replaced, meanwhile
    try {
      await d.reconnect()
      reconnecting = false
      lastError = null
      notify()
      return
    } catch {
      // Not back yet. Try again after a longer wait.
    }
  }
  reconnecting = false
  if (shared === d) shared = null
  lastError = "The DynaMo dropped out and did not come back. Check it is on and close by, then connect again."
  notify()
}

function watch(d: DynaMo) {
  d.onDisconnected = () => {
    if (shared !== d) return
    if (d.switchedOff) {
      shared = null
      zeroedAt = null
      lastError =
        d.lastPowerOff === "idle"
          ? "The DynaMo switched itself off after sitting idle. Wake it and connect again."
          : "The DynaMo was switched off."
      notify()
      return
    }
    void reconnectLoop(d)
  }
}

export type DynamoStatus = "unsupported" | "idle" | "connecting" | "reconnecting" | "connected"

export function useDynamo() {
  const [, setTick] = useState(0)
  const [connecting, setConnecting] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    setSupported(isSupported())
    const l = () => setTick((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  const connect = useCallback(async () => {
    lastError = null
    setConnecting(true)
    try {
      shared?.disconnect()
      const d = new DynaMo()
      watch(d)
      // requestDevice must run inside the click, so nothing is awaited first.
      await d.connect()
      await d.initialise()
      try {
        await d.setDisplayUnits(1)
      } catch {
        // The device's own screen only.
      }
      shared = d
      zeroedAt = null
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Could not connect to the DynaMo."
      shared = null
    } finally {
      setConnecting(false)
      notify()
    }
  }, [])

  const disconnect = useCallback(() => {
    const d = shared
    shared = null
    zeroedAt = null
    reconnecting = false
    d?.disconnect()
    notify()
  }, [])

  const zero = useCallback(async () => {
    if (!shared?.connected) throw new Error("Connect the DynaMo first.")
    await shared.zero()
    zeroedAt = Date.now()
    notify()
  }, [])

  const device = shared?.connected ? shared : null
  const status: DynamoStatus = !supported
    ? "unsupported"
    : connecting
      ? "connecting"
      : reconnecting
        ? "reconnecting"
        : device
          ? "connected"
          : "idle"

  // Keep the screen on while connected. The browser releases the lock when
  // the tab is hidden, so it is asked for again when the tab comes back.
  useEffect(() => {
    if (status !== "connected" || !("wakeLock" in navigator)) return
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
        // Refused (battery saver). The link still works; the screen may sleep.
      }
    }
    void acquire()
    document.addEventListener("visibilitychange", acquire)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", acquire)
      void lock?.release()
    }
  }, [status])

  const rates = device?.frequencies ?? []

  return {
    device,
    status,
    /** Fastest rate the firmware accepts — what the app uses for strength. */
    freq: rates[rates.length - 1] ?? 225,
    zeroedAt,
    error: lastError,
    clearError: () => {
      lastError = null
      notify()
    },
    connect,
    disconnect,
    zero,
  }
}
