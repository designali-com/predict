"use client"
import { Button } from "@workspace/ui/components/button"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Check, ChevronDown } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

interface ClinicOption {
  id: string
  name: string
  slug: string
  city: string | null
  role: string
}

/**
 * Which clinic you are looking at, and how to change it.
 *
 * Shown as plain text when somebody belongs to one clinic — a dropdown with
 * a single option is a decision nobody has to make, but *which* clinic this
 * screen is showing is worth stating on every page all the same.
 */
export function ClinicSwitcher() {
  const router = useRouter()
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    fetch("/api/clinics")
      .then((r) => r.json())
      .then((d) => {
        setClinics(d.clinics ?? [])
        setActiveId(d.active?.id ?? null)
      })
      .catch(() => setClinics([]))
  }, [])

  const active = clinics.find((c) => c.id === activeId)
  if (!active) return null

  async function switchTo(clinicId: string) {
    if (clinicId === activeId) return setOpen(false)
    setSwitching(true)
    const res = await fetch("/api/clinics/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId }),
    })
    setSwitching(false)
    setOpen(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? "Couldn't switch clinic")
      return
    }
    setActiveId(clinicId)
    // Everything on screen belongs to the old clinic — reload rather than
    // leave a page showing another clinic's rows under this clinic's name.
    router.refresh()
    window.location.reload()
  }

  if (clinics.length === 1) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate whitespace-nowrap">{active.name}</span>
      </span>
    )
  }

  return (
    <div className="relative min-w-0">
      <Button
        onClick={() => setOpen((v) => !v)}
        disabled={switching} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left max-w-full min-w-0">
        {switching ? <PredictSpinner className="size-4" /> : <Building2 className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate whitespace-nowrap">{active.name}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-60 rounded-md border border-border bg-card p-1 shadow-md">
            {clinics.map((c) => (
              <Button
                key={c.id}
                onClick={() => switchTo(c.id)} size="sm" variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left">
                <Check className={`h-3.5 w-3.5 ${c.id === activeId ? "opacity-100" : "opacity-0"}`} />
                <span className="flex-1">
                  {c.name}
                  <span className="block text-[11px] text-muted-foreground">
                    {[c.city, c.role].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * This account's clinics and the switch between them, for the account menu at
 * the foot of the sidebar (where the clinic panel has it too).
 */
export function useOpsClinics() {
  const [clinics, setClinics] = useState<ClinicOption[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    fetch("/api/clinics")
      .then((r) => r.json())
      .then((d) => {
        setClinics(d.clinics ?? [])
        setActiveId(d.active?.id ?? null)
      })
      .catch(() => setClinics([]))
  }, [])

  async function switchTo(clinicId: string) {
    if (clinicId === activeId) return
    setSwitching(true)
    const res = await fetch("/api/clinics/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinicId }),
    })
    setSwitching(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? "Couldn't switch clinic")
      return
    }
    setActiveId(clinicId)
    // Everything on screen belongs to the old clinic — reload, as the header
    // switch did.
    window.location.reload()
  }

  return { clinics, active: clinics.find((c) => c.id === activeId) ?? null, activeId, switching, switchTo }
}
