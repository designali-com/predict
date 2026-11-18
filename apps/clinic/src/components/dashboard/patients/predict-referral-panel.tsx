"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, FlaskConical, Send, Undo2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

interface Referral {
  id: string
  services: string[]
  status: string
  note: string | null
  consentAt: string
  createdAt: string
  referredBy: string | null
}

interface Results {
  biologicalAge: { biologicalAge: number; chronologicalAge: number; deltaAge: number; calculatedAt: string } | null
  biomarkers: { count: number; lastOn: string | null }
  bloodTests: { id: string; status: string; orderedOn: string; collectedOn: string | null }[]
  vald: { count: number; lastAt: string | null }
}

interface Data {
  services: { key: string; label: string }[]
  referrals: Referral[]
  results: Results | null
}

const STATUS_LABEL: Record<string, string> = {
  referred: "Referred",
  in_progress: "With Predict",
  completed: "Completed",
  cancelled: "Withdrawn",
}

/** Told to the app-access panel, which then shows the login the referral made. */
export const PATIENT_APP_CHANGED = "patient-app-changed"

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"
}

/**
 * Refer to Predict, and what came back.
 *
 * The patient is the clinic's. For diagnosis — blood tests, muscle age,
 * biological age, wearables — the clinic refers them to Predict, with their
 * consent; that is when they get the predict.fit app. Predict's results then
 * show here, read-only: the clinic sees them, Predict owns them.
 */
export function PredictReferralPanel({ patientId }: { patientId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [consent, setConsent] = useState(false)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/patients/${patientId}/referral`)
    if (res.ok) setData(await res.json())
  }, [patientId])

  useEffect(() => {
    void load()
  }, [load])

  async function refer() {
    setBusy(true)
    const res = await fetch(`/api/staff/patients/${patientId}/referral`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ services: picked, consent, note }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast.error(d.error ?? "Could not refer")
    toast.success("Referred to Predict")
    if (d.loginError) toast.warning(`No app login yet: ${d.loginError}`)
    setOpen(false)
    setPicked([])
    setConsent(false)
    setNote("")
    window.dispatchEvent(new Event(PATIENT_APP_CHANGED))
    void load()
  }

  async function withdraw(referralId: string) {
    if (!confirm("Withdraw this referral?")) return
    const res = await fetch(`/api/staff/patients/${patientId}/referral`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralId, status: "cancelled" }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return toast.error(d.error ?? "Could not withdraw")
    void load()
  }

  if (!data) return null
  const label = (key: string) => data.services.find((s) => s.key === key)?.label ?? key
  const results = data.results
  const hasResults = Boolean(
    results &&
      (results.biologicalAge || results.biomarkers.count || results.vald.count || results.bloodTests.length),
  )

  return (
    <div className="rounded-md border border-black/18 p-4 dark:border-white/12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-black/55 dark:text-white/40">
          <FlaskConical className="h-3.5 w-3.5" /> Predict diagnosis
        </p>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Send className="h-3.5 w-3.5" /> Refer to Predict
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {data.services.map((s) => (
              <label key={s.key} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(s.key)}
                  onChange={() => setPicked((p) => (p.includes(s.key) ? p.filter((k) => k !== s.key) : [...p, s.key]))}
                />
                {s.label}
              </label>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for Predict (optional)"
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <label className="flex cursor-pointer items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            The patient agrees to their details being shared with Predict, and to a predict.fit account being made for them.
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || !consent || picked.length === 0} onClick={refer}>
              {busy && <PredictSpinner className="size-4" />}
              Refer
            </Button>
          </div>
        </div>
      )}

      {data.referrals.length === 0 && !open && (
        <p className="mt-2 text-xs text-muted-foreground">
          {/* Results with no referral: tested before referrals were recorded. */}
          {hasResults
            ? "Tested by Predict before referrals were recorded. Refer again for a new test."
            : "Not referred yet. Blood tests, muscle age, biological age and wearables are done by Predict."}
        </p>
      )}

      {data.referrals.length > 0 && (
        <ul className="mt-3 space-y-2">
          {data.referrals.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 text-xs">
              <div>
                <p className="font-medium">{r.services.map(label).join(", ")}</p>
                <p className="text-muted-foreground">
                  {day(r.createdAt)}
                  {r.referredBy ? ` · by ${r.referredBy}` : ""}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{STATUS_LABEL[r.status] ?? r.status}</span>
                {r.status === "referred" && (
                  <button type="button" className="text-muted-foreground hover:text-red-600" title="Withdraw" onClick={() => withdraw(r.id)}>
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {results && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <Activity className="h-3.5 w-3.5" /> Results from Predict <span className="text-muted-foreground">(read-only)</span>
          </p>
          <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Biological age</dt>
              <dd className="font-medium">
                {results.biologicalAge
                  ? `${results.biologicalAge.biologicalAge.toFixed(1)} yrs (actual ${results.biologicalAge.chronologicalAge.toFixed(0)}, ${
                      results.biologicalAge.deltaAge >= 0 ? "+" : ""
                    }${results.biologicalAge.deltaAge.toFixed(1)}) · ${day(results.biologicalAge.calculatedAt)}`
                  : "Not yet"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Blood biomarkers</dt>
              <dd className="font-medium">
                {results.biomarkers.count ? `${results.biomarkers.count} values · ${day(results.biomarkers.lastOn)}` : "Not yet"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Muscle age (VALD)</dt>
              <dd className="font-medium">{results.vald.count ? `${results.vald.count} tests · last ${day(results.vald.lastAt)}` : "Not yet"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Blood tests</dt>
              <dd className="font-medium">
                {results.bloodTests.length
                  ? results.bloodTests.map((t) => `${day(t.orderedOn)} ${t.status}`).join(" · ")
                  : "None ordered"}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
