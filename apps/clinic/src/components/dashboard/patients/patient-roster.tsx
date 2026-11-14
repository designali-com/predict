"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import { MultiSelectFilter } from "@/src/components/dashboard/multi-select-filter"
import { ListPagination, type PageSize } from "@/src/components/dashboard/list-pagination"
import { ageFromDob } from "@workspace/db/form-scoring"
import { isGenderKnown } from "@workspace/db/registration-sync"
import Link from "next/link"
import { CalendarPlus, Search, UserCheck, UserPlus, UserX, X } from "lucide-react"
import { StartVisitDialog, type StartVisitTarget } from "./start-visit-dialog"
import { AddPatientDialog } from "./add-patient-dialog"
import { displayName, sexLetter, shortPlanName } from "@/src/lib/display-name"
import { UploadReportModal } from "@/src/components/dashboard/superadmin/appointments/upload-report-modal"

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
  userId: string | null
  hasLogin: boolean
  /** A live referral to Predict (a blood test alone shows as tested). */
  referredToPredict?: boolean
  course: { planName: string; status: string; perSession?: boolean; sessions?: number } | null
  /** In station or out station, from the plan's name. */
  station: "in" | "out" | null
  /** Came for a course once, now only buys medicine. */
  medicineOnly?: boolean
  /** Listed for their blood test; their course is with this other clinic. */
  otherClinic?: string | null
  hasReport: boolean
  lastVisitAt: string | null
  visitCount: number
}

function localMobile(phone: string | null | undefined) {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10)
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1)
  if (digits.length === 10) return digits
  return digits || phone
}

const INPUT =
  "w-full rounded-full border border-black/18 bg-white px-2.5 py-2 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:bg-black dark:text-white"

/**
 * Age from the chart, or a dash.
 *
 * One function shared with the forms rather than a second one here: the two
 * copies of this both divided by 365.25, which is a day out either side of a
 * birthday, and they disagreed with what FORM-I had already worked out.
 *
 * 1900 is the stub a chart carries from booking until somebody submits the
 * registration form. It is not an age anybody has, so it prints as nothing.
 */
function age(dob: string): string {
  if (dob.startsWith("1900-")) return "—"
  const years = ageFromDob(dob)
  return years === null ? "—" : String(years)
}

/** Sex, or a dash. UNKNOWN is "nobody asked", not OTHER — see registration-sync. */
function sexOf(gender: string | null | undefined): string {
  if (!gender || !isGenderKnown(gender)) return "—"
  return sexLetter(gender) ?? "—"
}

/**
 * Everyone with a chart.
 *
 * This replaced a list of `user` rows with role=patient — that is, only people
 * who had signed up for the patient app. A walk-in registered at the counter
 * has a contact, a chart and a patient code and usually no login, so most of
 * the clinic's own patients were missing from the clinic's own Patients page,
 * while the operations console could see them. That was backwards: the
 * clinical panel was the one that could not reach the clinical records.
 *
 * A patient is anyone a chart was created for, which happens the first time an
 * appointment is booked — course or no course.
 */
export function PatientRoster() {
  const [patients, setPatients] = useState<PatientRow[]>([])
  const [unchartered, setUnchartered] = useState<Unchartered[]>([])
  // Who the "what are they here for?" dialog is about. Null when closed.
  const [starting, setStarting] = useState<StartVisitTarget | null>(null)
  const [adding, setAdding] = useState(false)
  // Registering someone and filing their blood report are one job at the
  // desk, so the new chart is carried straight into the upload rather than
  // leaving the desk to search for the patient they just created.
  const [uploadFor, setUploadFor] = useState<{ chartId: string; name: string } | null>(null)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [matched, setMatched] = useState(0)
  // The Type filter beside the search box — see TYPE_FILTERS.
  // Several types at once; none ticked means every type.
  const [types, setTypes] = useState<string[]>([])
  const [courses, setCourses] = useState(true)
  const [predictOwned, setPredictOwned] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/patients?q=${encodeURIComponent(query)}&page=${page}&limit=${pageSize}&type=${types.join(",")}`)
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
  }, [query, page, pageSize, types])

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => load().finally(() => setLoading(false)), 250)
    return () => clearTimeout(timer)
  }, [load])

  const onCourse = patients.filter((p) => p.course?.status === "active").length
  const noLogin = patients.filter((p) => !p.hasLogin).length

  return (
    <div className="flex w-full flex-col gap-4 p-4 lg:p-6">
      {/* One line: title, search, filter, add, count. Wraps only on a phone. */}
      <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
        <h1 className="mr-auto shrink-0 text-xl font-semibold">Patients</h1>

        <div className="relative w-full min-w-0 md:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/60 dark:text-white/40" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            placeholder="Name, mobile or patient id"
            className={`${INPUT} h-9 py-0 pl-9 pr-9`}
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
              onClick={() => {
                setQuery("")
                setPage(1)
              }}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <MultiSelectFilter
          label="All types"
          value={types}
          onChange={(next) => {
            setTypes(next)
            setPage(1)
          }}
          options={TYPE_FILTERS.filter((f) => f.value && (courses || !COURSE_TYPES.has(f.value)) && (predictOwned || f.value !== "blood_report"))}
        />
        <Button variant="simple" size="default" className="h-9 shrink-0" onClick={() => setAdding(true)}>
          <UserPlus className="h-4 w-4" />
          Add patient
        </Button>
        <span className="shrink-0 whitespace-nowrap text-xs text-black/60 dark:text-white/40">{query.trim() ? `${matched} found` : types.length ? `${matched} of ${total} patients` : `${total} patients`}</span>
      </div>

      {/* Found, but with no chart. They are in contacts — a lead, a walk-in
          nobody booked, or someone whose chart was removed — and telling the
          desk "nobody matches" when the number is right there is the thing
          that sends them looking in the other app. */}
      {!loading && unchartered.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
          <p className="mb-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            Known, but no chart yet — a chart and a patient id are created on the first booking.
          </p>
          <ul className="flex flex-col gap-2">
            {unchartered.map((c) => (
              <li
                key={c.contactId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300/60 bg-white px-3 py-2 dark:border-amber-900/40 dark:bg-black"
              >
                <Link href={`/people/${c.contactId}`} className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.name ?? c.phone}</span>
                  <span className="block truncate text-xs text-black/60 dark:text-white/40">
                    {[localMobile(c.phone), c.email, c.stage].filter(Boolean).join(" · ")}
                  </span>
                </Link>
                {/* Not a link to booking any more: a consultation is only one
                    of the two things they might be here for, and therapy was
                    the one with no road. */}
                <Button variant="default" size="sm"
 onClick={() =>
 setStarting({
 contactId: c.contactId,
 name: c.name,
 phone: c.phone,
 email: c.email,
 })
 }

 >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  Book appointment
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center rounded-md border border-black/18 py-16 dark:border-white/10">
          <PredictSpinner />
        </div>
      ) : patients.length === 0 && unchartered.length === 0 ? (
        <div className="rounded-md border border-dashed border-black/22 p-8 text-center dark:border-white/15">
          <p className="text-sm text-black/60 dark:text-white/40">
            {query
              ? `Nobody matches “${query}”.`
              : "No patients yet. A chart is created on the first booking."}
          </p>
          {/* A dead end used to be the whole answer here. Somebody standing at
              the desk with a number nobody has heard of is not an error — it is
              a new patient, and booking is what makes them one. */}
          {query && (
            <Button variant="default" size="default" className="mt-3"
 onClick={() => setStarting({ phone: query })}

 >
              <UserPlus className="h-4 w-4" />
              Start a visit for {query}
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-black/18 dark:border-white/10">
          <table className="w-full text-xs">
            <thead className="border-b border-black/18 bg-black/[0.02] text-left text-[11px] uppercase tracking-wide text-black/55 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/45">
              <tr>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Patient id</th>
                <th className="px-3 py-1.5 font-medium">Name</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Mobile</th>
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Age / sex</th>
                {courses && <th className="whitespace-nowrap px-3 py-1.5 font-medium">Station</th>}
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">Status</th>
                {courses && <th className="px-3 py-1.5 font-medium">Course</th>}
                <th className="whitespace-nowrap px-3 py-1.5 font-medium">{predictOwned ? "App" : "Predict"}</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.patientId} className="border-b border-black/12 last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{p.patientCode}</td>
                  <td className="max-w-[220px] px-3 py-1.5">
                    {/* Contact id, not user id: that is the one every patient
                        has, with or without a login. */}
                    {p.contactId ? (
                      <Link href={`/people/${p.contactId}`} className="block truncate font-medium hover:underline">
                        {displayName(p.name)}
                      </Link>
                    ) : (
                      <span className="font-medium">{displayName(p.name)}</span>
                    )}
                    {/* Two names on one number is either a nickname or two
                        people sharing a phone. Either way the desk should
                        see it, not find out when a WhatsApp goes to the
                        wrong person. */}
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
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-black/60 dark:text-white/40">
                    {localMobile(p.mobileNumber)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs capitalize text-black/60 dark:text-white/40">
                    {[age(p.dateOfBirth), sexOf(p.gender)].filter((v) => v !== "—").join(" · ") ||
                      "—"}
                  </td>
                  {courses && (
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <StationChip p={p} />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <StatusChip p={p} courses={courses} bloodTests={predictOwned} />
                  </td>
                  {courses && (
                    <td className="px-3 py-1.5">
                      {p.course ? (
                        <span className="text-xs">{courseText(p.course)}</span>
                      ) : (
                        <span className="text-xs text-black/60 dark:text-white/40">—</span>
                      )}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {/* Whether they can see any of this themselves. Without a
                        login they cannot log their own at-home therapy. */}
                    {!predictOwned ? (
                      p.referredToPredict || p.hasReport ? (
                        <span className="inline-flex items-center rounded-md bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                          {p.referredToPredict ? "Referred" : "Tested"}
                        </span>
                      ) : (
                        <span className="text-xs opacity-50">—</span>
                      )
                    ) : p.hasLogin ? (
                      <span
                        className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"
                        title="Linked to a patient app login"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Linked
                      </span>
                    ) : (
                      <span
                        className="flex items-center gap-1 text-xs text-black/60 dark:text-white/40"
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
      )}
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
      {starting && (
        <StartVisitDialog
          target={starting}
          onClose={() => setStarting(null)}
          onDone={load}
        />
      )}

      <AddPatientDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={load}
        onUploadReport={(patient) =>
          // registerWalkIn's patientId is the chart, which is what the upload
          // files against — the account, if there is one, is resolved from it.
          setUploadFor({ chartId: patient.patientId, name: patient.name })
        }
      />

      <UploadReportModal
        open={Boolean(uploadFor)}
        reportType="final"
        chartId={uploadFor?.chartId}
        onClose={() => setUploadFor(null)}
        onUploaded={load}
      />
    </div>
  )
}


/** Filter values the API understands (?type=…). */
const TYPE_FILTERS = [
  { value: "", label: "All types" },
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

/** The plan's name without the station — that has its own column now. */
const planOnly = shortPlanName

/** In station or out station — a plan that names neither is an in-station one. */
function StationChip({ p }: { p: PatientRow }) {
  if (!p.course) return <span className="text-xs text-black/40 dark:text-white/30">—</span>
  const out = p.station === "out"
  return (
    <span className={`${CHIP} ${out ? "bg-violet-500/12 text-violet-700 dark:text-violet-300" : "bg-sky-500/12 text-sky-700 dark:text-sky-300"}`}>
      {out ? "Out station" : "In station"}
    </span>
  )
}

/** "2L · 42 Day", or for single sessions how many have been taken. */
function courseText(c: NonNullable<PatientRow["course"]>) {
  const name = planOnly(c.planName)
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
  if (c) return <span className={`${CHIP} bg-black/[0.06] text-black/60 dark:bg-white/10 dark:text-white/55`}>{c.status}</span>
  // A blood report is Predict's; a treatment clinic just sees them registered.
  return bloodTests && p.hasReport ? (
    <span className={`${CHIP} bg-rose-500/12 text-rose-700 dark:text-rose-300`}>Blood report</span>
  ) : (
    <span className={`${CHIP} bg-black/[0.06] text-black/55 dark:bg-white/10 dark:text-white/50`}>Registered</span>
  )
}
