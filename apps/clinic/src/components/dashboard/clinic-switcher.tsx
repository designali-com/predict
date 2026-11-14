"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface ClinicOption {
  id: string
  name: string
  slug: string
  city: string | null
  role: string
}

/**
 * This account's clinics, the one being looked at, and the switch between
 * them — shared by the switcher and the account menu.
 */
export function useClinics() {
  const router = useRouter()
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
    if (!res.ok) return
    setActiveId(clinicId)
    // Everything on screen belongs to the old clinic — reload rather than
    // leave a page showing another clinic's rows under this clinic's name.
    router.refresh()
    window.location.reload()
  }

  return { clinics, active: clinics.find((c) => c.id === activeId) ?? null, activeId, switching, switchTo }
}
