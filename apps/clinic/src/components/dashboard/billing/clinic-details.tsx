"use client"

import { Button } from "@workspace/ui/components/button"

import { useEffect, useState } from "react"
import { Building2, ChevronDown, TriangleAlert } from "lucide-react"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Profile {
  name: string
  legalName: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  pincode: string | null
  phone: string | null
  email: string | null
  website: string | null
  gstin: string | null
  registrationNo: string | null
  footerNote: string | null
  consentText: string | null
}

const INPUT =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

const LABEL =
  "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40"

const FIELDS: { key: keyof Profile; label: string; wide?: boolean; hint?: string }[] = [
  { key: "name", label: "Clinic name", hint: "Prints at the top of every receipt" },
  { key: "legalName", label: "Registered name", hint: "Only if different from the above" },
  { key: "addressLine1", label: "Address line 1", wide: true },
  { key: "addressLine2", label: "Address line 2", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pincode", label: "PIN code" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "gstin", label: "GSTIN", hint: "Left blank, nothing prints — not a blank field" },
  { key: "registrationNo", label: "Registration no." },
  { key: "footerNote", label: "Footer line", wide: true, hint: "Terms or a thank-you, under every receipt" },
  {
    key: "consentText",
    label: "Consent wording",
    wide: true,
    hint: "Printed above the signature pad at the foot of every clinical form. Forms already signed keep the wording they were signed against.",
  },
]

/** The five a receipt looks wrong without. */
const REQUIRED_FOR_PRINT: (keyof Profile)[] = [
  "addressLine1",
  "city",
  "state",
  "pincode",
  "phone",
]

/**
 * The clinic's own details, as they print.
 *
 * These live in the database rather than in code because an address and a
 * GSTIN on a financial document are facts about a business — a developer
 * guessing at them would put a wrong one on every receipt ever issued.
 */
export function ClinicDetails() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/staff/clinic-profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProfile(d?.profile ?? null))
      .catch(() => setProfile(null))
  }, [])

  const missing = profile
    ? REQUIRED_FOR_PRINT.filter((k) => !String(profile[k] ?? "").trim())
    : []

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/staff/clinic-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not save those details")
        return
      }
      setProfile(data.profile)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return null

  return (
    <section className="rounded-md border border-black/18 bg-white shadow-sm dark:border-white/10 dark:bg-black">
      <Button variant="ghost" size="default" className="w-full justify-between text-left h-auto justify-start whitespace-normal"
 onClick={() => setOpen((v) => !v)}

 >
        <span className="flex min-w-0 items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Clinic details on receipts</span>
            <span className="block truncate text-xs text-black/60 dark:text-white/40">
              {missing.length === 0
                ? `${profile.name} · printed on every receipt`
                : `${missing.length} field${missing.length === 1 ? "" : "s"} still blank — they print empty`}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {missing.length > 0 && (
            <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          )}
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </span>
      </Button>

      {open && (
        <form onSubmit={save} className="border-t border-black/12 p-4 dark:border-white/5">
          {error && (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((field) => (
              <label key={field.key} className={field.wide ? "sm:col-span-2 lg:col-span-3" : ""}>
                <span className={LABEL}>{field.label}</span>
                <input
                  value={profile[field.key] ?? ""}
                  onChange={(e) => {
                    setProfile({ ...profile, [field.key]: e.target.value })
                    setSaved(false)
                  }}
                  className={INPUT}
                />
                {field.hint && (
                  <span className="mt-1 block text-[11px] text-black/60 dark:text-white/40">
                    {field.hint}
                  </span>
                )}
              </label>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Button variant="default" size="default"
 type="submit"
 disabled={saving}

 >
              {saving && <PredictSpinner className="size-4" />}
              Save
            </Button>
            {saved && <span className="text-xs text-black/60 dark:text-white/40">Saved.</span>}
            {/* Said plainly: this does not reach paper already handed over. */}
            <span className="text-xs text-black/60 dark:text-white/40">
              Applies to receipts printed from now on.
            </span>
          </div>
        </form>
      )}
    </section>
  )
}
