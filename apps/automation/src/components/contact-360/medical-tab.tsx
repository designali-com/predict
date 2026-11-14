"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useMemo, useState } from "react"
import { FileText, ExternalLink } from "lucide-react"

interface Chart {
  patientCode: string
  firstName: string
  lastName: string
  gender: string
  dateOfBirth: string
  bloodGroup: string | null
  conditionType: string | null
  patientTrack: string | null
  onboardedAt: string | null
}
interface Reading {
  id: string
  value: number
  recordedAt: string
  name: string
  shortCode: string
  unit: string | null
  rangeMin: number | null
  rangeMax: number | null
}
interface BioAge {
  id: string
  chronologicalAge: number
  compositeScore: number
  deltaAge: number
  biologicalAge: number
  calculatedAt: string
}
interface Report {
  id: string
  fileUrl: string
  fileName: string | null
  reportType: string | null
  uploadedAt: string
}
interface Appointment {
  id: string
  type: string
  scheduledAt: string
  status: string
}
interface Note {
  id: string
  appointmentId: string
  authorRole: string
  content: string
  createdAt: string
}
interface Adherence {
  id: string
  logType: string
  status: string
  note: string | null
  source: string
  loggedAt: string
}

interface MedicalData {
  hasAccount: boolean
  chart: Chart | null
  appointments: Appointment[]
  notes: Note[]
  adherence: Adherence[]
  readings: Reading[]
  biologicalAge: BioAge[]
  reports: Report[]
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

function outOfRange(r: Reading): boolean {
  if (r.rangeMin !== null && r.value < r.rangeMin) return true
  if (r.rangeMax !== null && r.value > r.rangeMax) return true
  return false
}

export function MedicalTab({ contactId }: { contactId: string }) {
  const [data, setData] = useState<MedicalData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/contacts/${contactId}/medical`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [contactId])

  // One row per biomarker showing its most recent value. Readings arrive
  // newest-first, so the first occurrence of a shortCode is the latest — an
  // agent wants "where are they now", not the full longitudinal series.
  const latestReadings = useMemo(() => {
    if (!data) return []
    const seen = new Set<string>()
    return data.readings.filter((r) => {
      if (seen.has(r.shortCode)) return false
      seen.add(r.shortCode)
      return true
    })
  }, [data])

  const notesByAppointment = useMemo(() => {
    const map = new Map<string, Note[]>()
    for (const n of data?.notes ?? []) {
      map.set(n.appointmentId, [...(map.get(n.appointmentId) ?? []), n])
    }
    return map
  }, [data])

  if (loading || !data) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const latestBioAge = data.biologicalAge[0]

  return (
    <div className="space-y-4">
      {!data.hasAccount && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This contact has no patient account yet, so there are no biomarker readings, biological age
          results or uploaded reports — those are recorded against a registered user. Appointments and
          adherence below are still theirs.
        </p>
      )}

      <Section title="Chart">
        {data.chart ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {[
              ["Patient code", data.chart.patientCode],
              ["Name", `${data.chart.firstName} ${data.chart.lastName}`],
              ["Gender", data.chart.gender],
              ["Date of birth", new Date(data.chart.dateOfBirth).toLocaleDateString()],
              ["Blood group", data.chart.bloodGroup ?? "—"],
              ["Condition", data.chart.conditionType ?? "—"],
              ["Track", data.chart.patientTrack ?? "—"],
              [
                "Onboarded",
                data.chart.onboardedAt
                  ? new Date(data.chart.onboardedAt).toLocaleDateString()
                  : "Not yet",
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            No clinical chart — this person is still a lead, not a patient.
          </p>
        )}
      </Section>

      <Section title="Biological age">
        {latestBioAge ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Biological</p>
                <p className="text-2xl font-medium">{latestBioAge.biologicalAge.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Chronological</p>
                <p className="text-2xl font-medium">{latestBioAge.chronologicalAge.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Delta</p>
                <p
                  className={`text-2xl font-medium ${
                    latestBioAge.deltaAge > 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {latestBioAge.deltaAge > 0 ? "+" : ""}
                  {latestBioAge.deltaAge.toFixed(1)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Calculated {new Date(latestBioAge.calculatedAt).toLocaleDateString()}
              {data.biologicalAge.length > 1 && ` · ${data.biologicalAge.length} results on record`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No biological age result yet.</p>
        )}
      </Section>

      <Section title={`Biomarkers${latestReadings.length ? ` (${latestReadings.length})` : ""}`}>
        {latestReadings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No readings recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {latestReadings.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-1.5"
              >
                <span>
                  {r.name}
                  {r.rangeMin !== null && r.rangeMax !== null && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({r.rangeMin}–{r.rangeMax} {r.unit ?? ""})
                    </span>
                  )}
                </span>
                <span className={outOfRange(r) ? "font-medium text-red-600" : "text-muted-foreground"}>
                  {r.value} {r.unit ?? ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Appointments & visit notes">
        {data.appointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No appointments yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.appointments.map((a) => {
              const notes = notesByAppointment.get(a.id) ?? []
              return (
                <li key={a.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span>
                      {a.type} — {new Date(a.scheduledAt).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">{a.status}</span>
                  </div>
                  {notes.map((n) => (
                    <p key={n.id} className="mt-1.5 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                      <span className="font-medium">{n.authorRole}:</span> {n.content}
                    </p>
                  ))}
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="Reports">
        {data.reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports uploaded.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.reports.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-1.5"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  {r.fileName ?? r.reportType ?? "Report"}
                </span>
                <a
                  href={r.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {new Date(r.uploadedAt).toLocaleDateString()}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Adherence">
        {data.adherence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No adherence entries.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.adherence.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-1.5"
              >
                <span>
                  {l.logType} — {l.status}
                  {l.note && <span className="ml-1.5 text-xs text-muted-foreground">{l.note}</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(l.loggedAt).toLocaleDateString()} · {l.source}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
