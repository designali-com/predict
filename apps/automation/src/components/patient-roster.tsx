"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Search, UserCheck, UserX, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import { ageFromDob } from "@workspace/db/form-scoring"
import { isGenderKnown } from "@workspace/db/registration-sync"
import { PredictSpinner } from "@/src/components/predict-loader"
import { ListPagination, type PageSize } from "@/src/components/list-pagination"
import { MultiSelectFilter } from "@/src/components/multi-select-filter"
import { displayName, sexLetter, shortPlanName } from "@/src/lib/display-name"

/** Somebody we know who has no chart yet — a lead, or a walk-in nobody booked. */
interface Unchartered {
  contactId: string
  name: string | null
  phone: string | null
  email: string | null
  stage: string
}

interface PatientRow {
  patientId: string
  patientCode: string
  name: string
  /** The contact's name, only when it differs from the chart's. */
  contactName?: string | null
  gender: string
  dateOfBirth: string
  mobileNumber: string
  contactId: string | null
  hasLogin: boolean
  /** A live referral to Predict (a blood test alone shows as tested). */
  referredToPredict?: boolean
  course: { planName: string; status: string; perSession?: boolean; sessions?: number } | null
  station: "in" | "out" | null
  /** Came for a course once, now only buys medicine. */
  medicineOnly?: boolean
  /** Listed for their blood test; their course is with this other clinic. */
  otherClinic?: string | null
  hasReport: boolean
  lastVisitAt: string | null
  visitCount: number
}

/** Values the API understands (?type=…), the same as the clinic panel's. */
const TYPE_FILTERS = [
  { value: "in_station", label: "In station" },
  { value: "out_station", label: "Out station" },
  { value: "prescribed", label: "Prescribed" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "per_session", label: "Per session therapy" },
  { value: "medicine_only", label: "Medicine only" },
  { value: "blood_report", label: "Blood report only" },
  { value: "registered", label: "Registered only" },
]

/** Type filters about a course — not offered where there are no courses. */
const COURSE_TYPES = new Set(["in_station", "out_station", "prescribed", "active", "completed", "per_session", "medicine_only"])

const CHIP = "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"

function localMobile(phone: string | null | undefined) {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10)
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1)
  return digits || phone
}

/** 1900 is the stub a chart carries until the registration form is filled. */
function age(dob: string): string {
  if (!dob || dob.startsWith("1900-")) return "—"
  const years = ageFromDob(dob)
  return years === null ? "—" : String(years)
}

function sexOf(gender: string | null | undefined): string {
  if (!gender || !isGenderKnown(gender)) return "—"
  return sexLetter(gender) ?? "—"
}

/**
 * Ops' Patients page, laid out like the clinic panel's: everyone with a chart,
 * with patient id, age / sex, station, course status and whether they have the
 * app. Read-only here — booking, adding and reports stay in the clinic panel.
 */
export function PatientRoster() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      }
    >
      <Roster />
    </Suspense>
  )
}

function Roster() {
  const searchParams = useSearchParams()
  const [patients, setPatients] = useState<PatientRow[]>([])
  const [unchartered, setUnchartered] = useState<Unchartered[]>([])
  const [total, setTotal] = useState(0)
  const [matched, setMatched] = useState(0)
  const [loading, setLoading] = useState(true)
  // Kept in the URL like the Leads list, so Back from a patient lands here as it was.
  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const [types, setTypes] = useState<string[]>((searchParams.get("type") ?? "").split(",").filter(Boolean))
  const [courses, setCourses] = useState(true)
  const [predictOwned, setPredictOwned] = useState(true)
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1))
  const [pageSize, setPageSize] = useState<PageSize>(() => {
    const n = Number(searchParams.get("limit"))
    return (n === 100 || n === 200 ? n : 50) as PageSize
  })

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (query.trim()) params.set("q", query.trim())
    if (types.length) params.set("type", types.join(","))
    if (page > 1) params.set("page", String(page))
    if (pageSize !== 50) params.set("limit", String(pageSize))
    const url = new URL(window.location.href)
    url.search = params.toString()
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url)

    params.set("page", String(page))
    params.set("limit", String(pageSize))
    const res = await fetch(`/api/patients?${params.toString()}`)
    const data = await res.json().catch(() => null)
    setPatients(data?.patients ?? [])
    setUnchartered(data?.unchartered ?? [])
    setTotal(data?.total ?? 0)
    setMatched(data?.matched ?? data?.total ?? 0)
    // Station and course are a treatment clinic's columns; Predict has neither.
    setCourses(!Array.isArray(data?.modules) || data.modules.includes("therapy"))
    // The patient app and its login are Predict's; elsewhere the column says
    // whether the patient was sent to Predict.
    setPredictOwned(!Array.isArray(data?.modules) || data.modules.includes("diagnosis"))
    // A type ticked for another clinic (an old link, a switch) whose option is
    // hidden here would quietly empty the list — drop it.
    {
      const therapy = !Array.isArray(data?.modules) || data.modules.includes("therapy")
      const diag = !Array.isArray(data?.modules) || data.modules.includes("diagnosis")
      setTypes((prev) => {
        const next = prev.filter((v) => (therapy || !COURSE_TYPES.has(v)) && (diag || v !== "blood_report"))
        return next.length === prev.length ? prev : next
      })
    }
  }, [query, types, page, pageSize])

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => load().finally(() => setLoading(false)), 250)
    return () => clearTimeout(timer)
  }, [load])

  return (
    <div className="space-y-4">
      <PageHeader title="Patients" />

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            placeholder="Name, mobile or patient id"
            className="h-8 w-60 rounded-md border border-border bg-background pl-6 pr-7 text-xs focus:border-ring focus:outline-none"
          />
          {query && (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setQuery("")
                setPage(1)
              }}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <MultiSelectFilter
          label="Type"
          value={types}
          onChange={(next) => {
            setTypes(next)
            setPage(1)
          }}
          options={TYPE_FILTERS.filter((f) => (courses || !COURSE_TYPES.has(f.value)) && (predictOwned || f.value !== "blood_report"))}
        />
        <span className="text-xs text-muted-foreground">{query.trim() ? `${matched} found` : types.length ? `${matched} of ${total} patients` : `${total} patients`}</span>
      </div>

      {!loading && unchartered.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
          <p className="mb-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            Known, but no chart yet — a chart and a patient id are created on the first booking.
          </p>
          <ul className="flex flex-col gap-2">
            {unchartered.map((c) => (
              <li key={c.contactId}>
                <Link
                  href={`/contacts/${c.contactId}`}
                  className="block rounded-md border border-amber-300/60 bg-background px-3 py-2 hover:bg-muted dark:border-amber-900/40"
                >
                  <span className="block truncate text-sm font-medium">{c.name ?? c.phone}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[localMobile(c.phone), c.email, c.stage].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center rounded-md border border-border py-16">
          <PredictSpinner />
        </div>
      ) : patients.length === 0 && unchartered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {query ? `Nobody matches “${query}”.` : "No patients yet. A chart is created on the first booking."}
        </p>
      ) : patients.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Patient id</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Mobile</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Age / sex</th>
                {courses && <th className="whitespace-nowrap px-3 py-2 font-medium">Station</th>}
                <th className="whitespace-nowrap px-3 py-2 font-medium">Status</th>
                {courses && <th className="px-3 py-2 font-medium">Course</th>}
                <th className="whitespace-nowrap px-3 py-2 font-medium">{predictOwned ? "App" : "Predict"}</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.patientId} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="whitespace-nowrap px-3 py-2 font-mono">{p.patientCode}</td>
                  <td className="max-w-[240px] px-3 py-2">
                    {p.contactId ? (
                      <Link href={`/contacts/${p.contactId}`} className="block truncate font-medium hover:underline">
                        {displayName(p.name)}
                      </Link>
                    ) : (
                      <span className="font-medium">{displayName(p.name)}</span>
                    )}
                    {/* Two names on one number: a nickname or a shared family phone. */}
                    {p.otherClinic && (
                      <div className="text-[11px] text-sky-700 dark:text-sky-400" title="Their course is with this clinic; the blood test is Predict's">
                        {p.otherClinic} patient
                      </div>
                    )}
                    {p.contactName && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-400">
                        Number also on file as {displayName(p.contactName)}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-muted-foreground">{localMobile(p.mobileNumber)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {[age(p.dateOfBirth), sexOf(p.gender)].filter((v) => v !== "—").join(" · ") || "—"}
                  </td>
                  {courses && (
                    <td className="whitespace-nowrap px-3 py-2">
                      <StationChip p={p} />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2">
                    <StatusChip p={p} courses={courses} bloodTests={predictOwned} />
                  </td>
                  {courses && (
                    <td className="px-3 py-2">
                      {p.course ? courseText(p.course) : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2">
                    {!predictOwned ? (
                      p.referredToPredict || p.hasReport ? (
                        <span className="inline-flex items-center rounded-md bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                          {p.referredToPredict ? "Referred" : "Tested"}
                        </span>
                      ) : (
                        <span className="text-xs opacity-50">—</span>
                      )
                    ) : p.hasLogin ? (
                      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400" title="Linked to a patient app login">
                        <UserCheck className="h-3.5 w-3.5" />
                        Linked
                      </span>
                    ) : (
                      <span
                        className="flex items-center gap-1 text-muted-foreground"
                        title="No login — links itself when they sign up with this mobile number"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        No login
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && matched > 0 && (
        <ListPagination
          page={page}
          pageSize={pageSize}
          total={matched}
          onPage={setPage}
          onPageSize={(s) => {
            setPageSize(s)
            setPage(1)
          }}
        />
      )}
    </div>
  )
}

function StationChip({ p }: { p: PatientRow }) {
  if (!p.course) return <span className="text-muted-foreground">—</span>
  const out = p.station === "out"
  return (
    <span className={`${CHIP} ${out ? "bg-violet-500/12 text-violet-700 dark:text-violet-300" : "bg-sky-500/12 text-sky-700 dark:text-sky-300"}`}>
      {out ? "Out station" : "In station"}
    </span>
  )
}

/** "2L · 42 Day", or for single sessions how many have been taken. */
function courseText(c: NonNullable<PatientRow["course"]>) {
  const name = shortPlanName(c.planName)
  return c.perSession ? `${name} · ${c.sessions ?? 0} ${c.sessions === 1 ? "session" : "sessions"}` : name
}

/**
 * Where they stand, most current first: a course running or prescribed;
 * therapy taken one session at a time; medicine only; a finished course;
 * a blood report; or simply registered.
 */
function StatusChip({ p, courses = true, bloodTests = true }: { p: PatientRow; courses?: boolean; bloodTests?: boolean }) {
  // Without courses (Predict) the status is about the blood test alone.
  const c = courses ? p.course : null
  if (c && !c.perSession && (c.status === "active" || c.status === "prescribed")) {
    const look =
      c.status === "active"
        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
        : "bg-amber-500/15 text-amber-800 dark:text-amber-300"
    return <span className={`${CHIP} ${look}`}>{c.status}</span>
  }
  if (c?.perSession) return <span className={`${CHIP} bg-teal-500/12 text-teal-700 dark:text-teal-300`}>Per session</span>
  if (courses && p.medicineOnly) return <span className={`${CHIP} bg-indigo-500/12 text-indigo-700 dark:text-indigo-300`}>Medicine only</span>
  if (c) return <span className={`${CHIP} bg-muted text-muted-foreground`}>{c.status}</span>
  // A blood report is Predict's; a treatment clinic just sees them registered.
  return bloodTests && p.hasReport ? (
    <span className={`${CHIP} bg-rose-500/12 text-rose-700 dark:text-rose-300`}>Blood report</span>
  ) : (
    <span className={`${CHIP} bg-muted text-muted-foreground`}>Registered</span>
  )
}
