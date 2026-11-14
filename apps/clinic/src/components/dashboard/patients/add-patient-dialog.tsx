"use client"

import { Button } from "@workspace/ui/components/button"

import { useState } from "react"
import { AlertCircle, X } from "lucide-react"
import { PredictSpinner } from "@/src/components/predict-loader"

interface AddPatientDialogProps {
  open: boolean
  onClose: () => void
  /** Called after a chart is created, so the roster reloads. */
  onCreated: () => void
  /** Offered at the end, so the report can be filed without hunting for them. */
  onUploadReport?: (patient: { patientId: string; patientCode: string; name: string }) => void
}

interface Created {
  patientId: string
  patientCode: string
  isReturning: boolean
  /** A login was made (or already existed) for the chart. */
  loginCreated: boolean
  loginNote: string | null
  /** The number was already on file under this other name. */
  matchedContactName: string | null
  name: string
}

const INPUT =
  "w-full rounded-md border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"
const LABEL = "mb-1 block text-xs font-medium text-black/70 dark:text-white/55"

/**
 * Register a patient at the desk, with a login if they need one.
 *
 * The gap this fills: a chart could only be created by booking a visit, and a
 * patient login could not be created from the panel at all. So a round of
 * blood tests — people who have no appointment and may never have one — had
 * nowhere to go.
 *
 * The login is made from the mobile number with no password, and comes with a
 * sign-in link to send the patient. They set a password themselves later.
 */
export function AddPatientDialog({
  open,
  onClose,
  onCreated,
  onUploadReport,
}: AddPatientDialogProps) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [dateOfBirth, setDateOfBirth] = useState("")
  // Either an exact date of birth or just the age in years — both optional.
  const [dobMode, setDobMode] = useState<"dob" | "age">("dob")
  const [age, setAge] = useState("")
  const [gender, setGender] = useState("")
  const [email, setEmail] = useState("")

  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [created, setCreated] = useState<Created | null>(null)

  if (!open) return null

  function reset() {
    setName("")
    setPhone("")
    setDateOfBirth("")
    setDobMode("dob")
    setAge("")
    setGender("")
    setEmail("")
    setBusy(false)
    setErrorMsg("")
    setCreated(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    setErrorMsg("")

    setBusy(true)
    try {
      const res = await fetch("/api/staff/patients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          dateOfBirth: dobMode === "dob" && dateOfBirth ? dateOfBirth : null,
          age: dobMode === "age" && age.trim() ? Number(age) : null,
          gender,
          email: email.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not register this patient")

      setCreated({ ...data, name: name.trim() })
      onCreated()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not register this patient")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
        <div
          className="relative w-full max-w-lg overflow-hidden rounded-md border border-black/22 bg-white text-black dark:border-white/15 dark:bg-black dark:text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-black/18 px-6 py-5 dark:border-white/10">
            <div>
              <h2 className="text-base font-semibold">
                {created ? "Patient registered" : "Add a patient"}
              </h2>
              <p className="mt-0.5 text-xs text-black/65 dark:text-white/45">
                {created
                  ? `Patient id ${created.patientCode}`
                  : "A chart, and a login if they need one. No appointment required."}
              </p>
            </div>
            <Button variant="ghost" size="icon-sm"
 onClick={handleClose}

 >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* ------------- FORM ------------- */}
          {!created && (
            <div className="flex flex-col gap-4 p-6">
              <div>
                <label className={LABEL}>Full name<span className="text-red-600"> *</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>Mobile number<span className="text-red-600"> *</span></label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="10 digits"
                    className={INPUT}
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className={LABEL.replace("mb-1", "mb-0")}>
                      {dobMode === "dob" ? "Date of birth" : "Age"}
                    </label>
                    <div className="flex overflow-hidden rounded-md border border-black/15 text-[11px] dark:border-white/15">
                      {(["dob", "age"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setDobMode(m)}
                          className={`px-2 py-0.5 font-medium ${
                            dobMode === m ? "bg-black text-white dark:bg-white dark:text-black" : "text-black/60 hover:bg-black/5 dark:text-white/60"
                          }`}
                        >
                          {m === "dob" ? "Date" : "Age"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {dobMode === "dob" ? (
                    <input
                      type="date"
                      value={dateOfBirth}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className={INPUT}
                    />
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={120}
                      inputMode="numeric"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="Years, e.g. 45"
                      className={INPUT}
                    />
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>Sex<span className="text-red-600"> *</span></label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className={INPUT}
                  >
                    <option value="">Select…</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>
                    Email
                  </label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    inputMode="email"
                    className={INPUT}
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" type="button" onClick={handleClose} disabled={busy} >
                  Cancel
                </Button>
                <Button variant="simple" size="sm"
 type="button"
 onClick={handleSubmit}
 disabled={busy || !name.trim() || !phone.trim() || !gender || (dobMode === "age" && age.trim() !== "" && !(Number(age) >= 0 && Number(age) <= 120))}

 >
                  {busy ? (
                    <>
                      <PredictSpinner className="size-4" /> Registering…
                    </>
                  ) : (
                    "Register patient"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ------------- RESULT ------------- */}
          {created && (
            <div className="flex flex-col gap-4 p-6">
              {created.matchedContactName && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  This mobile number was already on file as{" "}
                  <span className="font-semibold">{created.matchedContactName}</span>, so the chart was
                  added to that same person. If {created.name} is someone else, one of them has the
                  wrong number — fix it before sending anything, or WhatsApp messages and login codes
                  will reach the wrong person.
                </p>
              )}

              {created.isReturning && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  This mobile number already had a chart, so no second one was created —
                  {" "}{created.patientCode} is the chart they already had.
                </p>
              )}

              <p className="rounded-md border border-dashed border-black/18 px-4 py-3 text-xs leading-relaxed text-black/60 dark:border-white/12 dark:text-white/45">
                No app login yet — create one from their record (Patient app access) when they should
                have it, then send them the sign-in link on WhatsApp or email.
              </p>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" type="button" onClick={handleClose} >
                  Done
                </Button>
                {onUploadReport && (
                  <Button variant="simple" size="sm"
 type="button"
 onClick={() => {
 const patient = {
 patientId: created.patientId,
 patientCode: created.patientCode,
 name: created.name,
 }
 reset()
 onClose()
 onUploadReport(patient)
 }}

 >
                    Upload blood report
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
