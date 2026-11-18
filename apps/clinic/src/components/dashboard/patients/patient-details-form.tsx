"use client"

import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { isGenderKnown } from "@workspace/db/registration-sync"

/**
 * A patient's own details — name, mobile, email, date of birth, sex, blood
 * group — edited in one place and saved through PATCH /api/staff/patients/[id].
 * Used on the patient's record and on an appointment, so both edit the same
 * fields the same way.
 */

const FIELD =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"
const FIELD_LABEL = "mb-1 block text-xs font-medium text-black/70 dark:text-white/55"

export function DetailsForm({
  id,
  name,
  phone,
  email,
  dateOfBirth,
  gender,
  bloodGroup,
  onSaved,
  onCancel,
}: {
  id: string
  name: string
  phone: string
  email: string
  dateOfBirth: string
  gender: string
  bloodGroup: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [values, setValues] = useState({ name, phone, email, dateOfBirth, gender, bloodGroup })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function save() {
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/staff/patients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "Could not save these details")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save these details")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={FIELD_LABEL}>Full name</span>
        <input className={FIELD} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
      </label>
      <label>
        <span className={FIELD_LABEL}>Mobile</span>
        <input className={FIELD} value={values.phone} inputMode="tel" onChange={(e) => setValues({ ...values, phone: e.target.value })} />
      </label>
      <label>
        <span className={FIELD_LABEL}>Email</span>
        <input className={FIELD} value={values.email} inputMode="email" onChange={(e) => setValues({ ...values, email: e.target.value })} />
      </label>
      <label>
        <span className={FIELD_LABEL}>Date of birth</span>
        <input className={FIELD} type="date" value={values.dateOfBirth} onChange={(e) => setValues({ ...values, dateOfBirth: e.target.value })} />
      </label>
      <label>
        <span className={FIELD_LABEL}>Sex</span>
        <select className={FIELD} value={values.gender} onChange={(e) => setValues({ ...values, gender: e.target.value })}>
          <option value="">Select…</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label>
        <span className={FIELD_LABEL}>Blood group</span>
        <select className={FIELD} value={values.bloodGroup} onChange={(e) => setValues({ ...values, bloodGroup: e.target.value })}>
          <option value="">—</option>
          {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((group) => (
            <option key={group} value={group}>{group}</option>
          ))}
        </select>
      </label>
      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="button" size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  )
}

/**
 * The same form, for a page that does not already hold the chart — an
 * appointment. Reads the patient's current details first, so nothing is
 * overwritten with a blank.
 */
export function EditPatientDetails({
  patientId,
  onSaved,
  onCancel,
}: {
  /** A contact id, a chart id or a user id. */
  patientId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [initial, setInitial] = useState<{
    name: string
    phone: string
    email: string
    dateOfBirth: string
    gender: string
    bloodGroup: string
  } | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let live = true
    fetch(`/api/staff/patients/${patientId}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!live) return
        if (!ok) {
          setError(d?.error ?? "Could not load the patient's details")
          return
        }
        const chart = d?.patient
        const person = d?.contact
        setInitial({
          name: person?.name ?? [chart?.firstName, chart?.lastName].filter(Boolean).join(" ") ?? "",
          phone: person?.phone ?? chart?.mobileNumber ?? "",
          email: person?.email ?? chart?.email ?? "",
          dateOfBirth: chart?.dateOfBirth && !String(chart.dateOfBirth).startsWith("1900-") ? String(chart.dateOfBirth).slice(0, 10) : "",
          gender: chart && isGenderKnown(chart.gender) ? chart.gender : "",
          bloodGroup: chart?.bloodGroup ?? "",
        })
      })
      .catch(() => live && setError("Could not load the patient's details"))
    return () => {
      live = false
    }
  }, [patientId])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!initial) return <p className="text-sm text-black/50 dark:text-white/40">Loading…</p>
  return <DetailsForm id={patientId} {...initial} onSaved={onSaved} onCancel={onCancel} />
}
