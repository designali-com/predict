"use client"

import { createContext, useContext } from "react"

/**
 * Where the lab's pages live. On lab.predict.fit they are at the root
 * (/, /orders/…, /schedule) — the proxy maps them onto /lab inside the app —
 * and on the clinic's own host under /lab. Every link in the lab goes through
 * labHref so it reads right on either.
 */
const LabBase = createContext("/lab")

export function LabBaseProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <LabBase.Provider value={base}>{children}</LabBase.Provider>
}

/** A lab path ("/", "/orders/123", "/schedule") as a link on the current host. */
export function useLabHref() {
  const base = useContext(LabBase)
  return (path: string) => (base ? `${base}${path === "/" ? "" : path}` : path) || "/"
}
