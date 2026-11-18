"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import { ageFromDob } from "@workspace/db/form-scoring"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  CalendarDays,
  ClipboardList,
  Droplet,
  Dumbbell,
  ExternalLink,
  FileText,
  FlaskConical,
  FolderOpen,
  Mail,
  Phone,
  Pill,
  Plus,
  PresentationIcon,
  Salad,
  StickyNote,
  UserCheck,
  UserRound,
  UserX,
  Wallet,
  Send,
  Printer,
} from "lucide-react"
import { TherapyPanel } from "@/src/components/dashboard/treatment-plans/therapy-panel"
import { CarePlanPanel } from "@/src/components/dashboard/care-plan-panel"
import { StartVisitDialog, type StartVisitTarget } from "./start-visit-dialog"
import { formatPrice } from "@workspace/db/treatment-plan"
import { isGenderKnown } from "@workspace/db/registration-sync"
import { DetailsForm } from "./patient-details-form"
import { BillingAccessNote, CoursePayments } from "@/src/components/dashboard/billing/course-payments"
import { PatientDues } from "@/src/components/dashboard/billing/patient-dues"
import { UploadReportModal } from "@/src/components/dashboard/superadmin/appointments/upload-report-modal"
import { ManualBiomarkerEntry } from "./manual-biomarker-entry"
import { BiomarkerHistory } from "./biomarker-history"
import { BiologicalAgeIndexPicker } from "./biological-age-index-picker"
import { PatientIntakeAnswers } from "./intake-answers"
import { LoginLinkPanel } from "./login-link-panel"
import { PredictReferralPanel } from "./predict-referral-panel"
import { DocumentsPanel } from "@workspace/ui/components/documents-panel"
import { ExerciseAndVald } from "./exercise-and-vald"
import { PatientSummaryPanel } from "./patient-summary-panel"
import { MedicinesPanel } from "./medicines-panel"
import { BloodTests } from "./blood-tests"
import { PatientConsult } from "./patient-consult"
import { PatientNotes } from "./patient-notes"
import { DietProtocolEditor } from "./diet-protocol-editor"
import { CheckinLog } from "./checkin-log"
import { VisitForms } from "@/src/components/dashboard/forms/visit-forms"
import { displayName, sexLetter, stageLabel } from "@/src/lib/display-name"
import {
  Fact,
  RecordBadge,
  RecordEmpty,
  RecordSection,
  RecordSegments,
  RecordStat,
  RecordTable,
  RecordTabs,
  recordDate,
  recordDateTime,
  type RecordTab,
} from "./record-ui"

interface Chart {
  id: string
  patientCode: string
  firstName: string
  lastName: string
  gender: string
  dateOfBirth: string
  bloodGroup: string | null
  mobileNumber: string
  email: string | null
  userId: string | null
}

interface Person {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  stage: string
  userId: string | null
}

interface Payment {
  id: string
  receiptNo: string | null
  kind: string
  amountInPaise: number
  method: string
  reference: string | null
  voidedAt: string | null
  voidReason: string | null
  collectedAt: string
}

interface Report {
  id: string
  fileUrl: string
  reportType: string | null
  uploadedAt: string
}

interface Visit {
  id: string
  scheduledAt: string
  type: string
  status: string
}

/**
 * One patient, one screen, eight questions.
 *
 * It had grown to fourteen tabs, several of them two halves of one job —
 * Appointments and Consult both listed the visits, Biomarkers and Blood test
 * were the same report seen twice, Therapy and Medicines one course. Now each
 * tab is a job, in the order the desk asks: who are they, when did they come,
 * what do they eat, what do they do, what treatment, what money, what
 * results, what was written down. Where a job has parts, they are segments
 * inside it rather than tabs of their own.
 *
 * The daily WhatsApp check-ins no longer have a tab: each kind sits with what
 * it checks — exercise on Exercise, diet on Nutrition, medicine on Treatment.
 */
type TabKey = "overview" | "summary" | "visits" | "nutrition" | "exercise" | "treatment" | "billing" | "lab" | "notes"

const TAB_DEFS: Omit<RecordTab<TabKey>, "count">[] = [
  { key: "overview", label: "Overview", icon: UserRound },
  { key: "summary", label: "Summary", icon: PresentationIcon },
  { key: "visits", label: "Visits", icon: CalendarDays },
  { key: "nutrition", label: "Nutrition", icon: Salad },
  { key: "exercise", label: "Rehab", icon: Dumbbell },
  { key: "treatment", label: "Treatment", icon: Pill },
  { key: "billing", label: "Billing", icon: Wallet },
  { key: "lab", label: "Lab", icon: FlaskConical },
  { key: "notes", label: "Notes & files", icon: StickyNote },
]

/**
 * Opened by Predict for its blood-test work, but treated by another clinic:
 * their summary, diet, rehab and notes are that clinic's, not Predict's.
 */
const CROSS_CLINIC_HIDDEN_TABS = new Set<TabKey>(["summary", "nutrition", "exercise", "notes"])

/** The referral's state, as the treating clinic reads it. */
const REFERRAL_LABEL: Record<string, string> = {
  referred: "Referred to Predict",
  in_progress: "With Predict",
  completed: "Predict · done",
}

/** Predict's own work, not shown to a partner hospital's doctor: they see Overview, Lab and Notes & files. */
const PARTNER_HIDDEN_TABS = new Set<TabKey>(["summary", "visits", "nutrition", "exercise", "treatment", "billing"])

/**
 * Tabs that belong to a clinic module. A clinic without it does not show the
 * tab — Predict (diagnosis only) has no visits, treatment or billing. A tab
 * with several modules shows while any one of them is on.
 */
const TAB_MODULES: Partial<Record<TabKey, string[]>> = {
  visits: ["appointments"],
  treatment: ["therapy", "medicine"],
  billing: ["billing"],
  // Blood tests, reports and biomarkers are Predict's. A treatment clinic
  // refers the patient and reads the results in Overview's Predict panel.
  lab: ["diagnosis"],
}

/**
 * `?tab=` keeps the tab across a refresh and in a link someone sends. The old
 * tab names still arrive from bookmarks and messages, so each lands on the tab
 * that now holds it.
 */
const TAB_ALIASES: Record<string, TabKey> = {
  overview: "overview",
  summary: "summary",
  report: "summary",
  visits: "visits",
  appointments: "visits",
  consult: "visits",
  nutrition: "nutrition",
  questionnaire: "nutrition",
  exercise: "exercise",
  "exercise & vald": "exercise",
  rehab: "exercise",
  vald: "exercise",
  emg: "exercise",
  treatment: "treatment",
  therapy: "treatment",
  medicines: "treatment",
  "daily log": "overview",
  billing: "billing",
  lab: "lab",
  biomarkers: "lab",
  "blood test": "lab",
  notes: "notes",
  documents: "notes",
}

type NutritionPart = "consult" | "diet" | "questionnaire" | "checkins"
type TreatmentPart = "course" | "medicines" | "checkins"
type LabPart = "results" | "tests"

const VISIT_TONE: Record<string, "good" | "primary" | "warn" | "bad" | "neutral"> = {
  completed: "good",
  confirmed: "primary",
  scheduled: "primary",
  in_consultation: "warn",
  no_show: "bad",
  cancelled: "bad",
}

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

/**
 * Sex as it should read, or a dash.
 *
 * UNKNOWN is the stand-in a chart carries until somebody asks, and it prints
 * as nothing. It is kept apart from OTHER because OTHER is a real answer —
 * where LGBTQ+ from the registration form lands — and showing "other" for a
 * question nobody put is wrong twice over.
 */
function sexOf(gender: string | null | undefined): string {
  if (!gender || !isGenderKnown(gender)) return "—"
  return sexLetter(gender) ?? "—"
}

/**
 * One patient's record, opened by contact id.
 *
 * The page this sits behind used to be keyed on a user account, so a walk-in —
 * who has a chart, a patient code and often a course, but no login — could not
 * be opened in the clinical panel at all.
 *
 * What a linked login adds is the patient's own view: reports, biomarkers,
 * biological age and wearables are all recorded against the account, so a chart
 * without one genuinely has none. The page says which, rather than showing
 * empty panels that read as a patient with no results.
 */
export function PatientRecordView({ id }: { id: string }) {
  const [chart, setChart] = useState<Chart | null>(null)
  const [person, setPerson] = useState<Person | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [hasLogin, setHasLogin] = useState(false)
  // A partner hospital's doctor: the chart, results and notes, not Predict's
  // visits, plans, treatment or money.
  const [partnerView, setPartnerView] = useState(false)
  // The active clinic's modules; null until loaded (then every tab shows).
  const [modules, setModules] = useState<string[] | null>(null)
  // Another clinic's patient opened by Predict for their blood test.
  const [crossClinic, setCrossClinic] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [biomarkerCount, setBiomarkerCount] = useState(0)
  const [predictReferral, setPredictReferral] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  // The tab in the address, so a refresh or a shared link opens where it was.
  const searchParams = useSearchParams()
  const [requestedTab, setTabState] = useState<TabKey>(() => TAB_ALIASES[searchParams.get("tab")?.toLowerCase() ?? ""] ?? "overview")
  const [nutritionPart, setNutritionPart] = useState<NutritionPart>("consult")
  const [treatmentPart, setTreatmentPart] = useState<TreatmentPart>("course")
  const [labPart, setLabPart] = useState<LabPart>("results")
  const [chosenVisitId, setVisitId] = useState<string | null>(null)
  const [starting, setStarting] = useState<StartVisitTarget | null>(null)
  // Which report the upload dialog is taking. Null when it is closed.
  const [uploading, setUploading] = useState<"initial" | "final" | null>(null)
  const [enteringValues, setEnteringValues] = useState<boolean | { orderId?: string }>(false)
  // Bumped after values are saved so the history refetches — it holds its own
  // readings, which the chart reload does not touch.
  const [bloodWorkVersion, setBloodWorkVersion] = useState(0)
  const [editing, setEditing] = useState(false)

  // replaceState rather than the router: changing tab is not a navigation,
  // and must not refetch the page or add to the back stack.
  const setTab = useCallback((key: TabKey) => {
    setTabState(key)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", key)
    window.history.replaceState(window.history.state, "", url)
  }, [])

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/patients/${id}`)
    if (!res.ok) {
      setMissing(true)
      return
    }
    const data = await res.json().catch(() => null)
    setChart(data?.patient ?? null)
    setPerson(data?.contact ?? null)
    setVisits(data?.visits ?? [])
    setPayments(data?.payments ?? [])
    setReports(data?.reports ?? [])
    setBiomarkerCount(Number(data?.biomarkerCount ?? 0))
    setPredictReferral(data?.predictReferral ?? null)
    setHasLogin(Boolean(data?.hasLogin))
    setPartnerView(Boolean(data?.viewer?.partner))
    setModules(Array.isArray(data?.viewer?.modules) ? data.viewer.modules : null)
    setCrossClinic(Boolean(data?.viewer?.crossClinic))
  }, [id])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (missing || (!chart && !person)) {
    return (
      <div className="p-6 text-sm text-black/60 dark:text-white/40">
        No such patient.{" "}
        <Link href="/patients" className="underline">
          Back to patients
        </Link>
      </div>
    )
  }

  // Reports and biomarkers are filed against the patient's own app account, so
  // uploading needs the login id — not the chart id and not the contact id.
  const loginId = chart?.userId ?? person?.userId ?? null

  const name =
    person?.name ?? [chart?.firstName, chart?.lastName].filter(Boolean).join(" ") ?? "Unknown"
  const phone = person?.phone ?? chart?.mobileNumber ?? null
  const email = person?.email ?? chart?.email ?? null
  const startVisit = person
    ? () => setStarting({ contactId: person.id, name: person.name, phone: person.phone, email: person.email })
    : undefined

  // The visit the forms below the list are showing: the newest until one is
  // picked, and never one that has gone from the list.
  const visitId = visits.some((v) => v.id === chosenVisitId) ? chosenVisitId : (visits[0]?.id ?? null)
  // A partner who arrives on a tab they cannot open (an old link) sees Overview.
  const tabHidden = (key: TabKey) =>
    (partnerView && PARTNER_HIDDEN_TABS.has(key)) ||
    (crossClinic && CROSS_CLINIC_HIDDEN_TABS.has(key)) ||
    (modules !== null && TAB_MODULES[key] !== undefined && !TAB_MODULES[key]!.some((m) => modules.includes(m)))
  const tab = tabHidden(requestedTab) ? "overview" : requestedTab
  // Blood tests, the patient app and its login are Predict's: shown in a
  // clinic with Diagnosis (Predict), summed up as a referral everywhere else.
  const predictOwned = modules === null || modules.includes("diagnosis")

  const livePayments = payments.filter((p) => !p.voidedAt)
  const counts: Partial<Record<TabKey, number>> = {
    visits: visits.length,
    billing: livePayments.length,
    lab: reports.length,
  }
  const tabs = TAB_DEFS.filter((t) => !tabHidden(t.key)).map((t) => ({
    ...t,
    count: counts[t.key],
  }))
  const noChart = (what: string) => (
    <RecordEmpty>A chart is created on the first booking. {what} are filed against it.</RecordEmpty>
  )

  return (
    <div className="flex w-full flex-col gap-4 p-4 lg:p-6">

      {/* Who this is, in one band: initials, name with id and stage, how to
          reach them — and on the right, what they have and have not got. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-black/10 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-black">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
            {name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0])
              .join("") || "?"}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="truncate text-lg font-semibold leading-tight">{displayName(name)}</h1>
              {chart && (
                <span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px] text-black/70 dark:bg-white/10 dark:text-white/70">
                  {chart.patientCode}
                </span>
              )}
              {person && (
                <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  {stageLabel(person.stage)}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-black/60 dark:text-white/50">
              {phone && (
                <a href={`tel:+${phone}`} className="flex items-center gap-1 hover:underline">
                  <Phone className="h-3 w-3" />
                  {phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "")}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="flex min-w-0 items-center gap-1 hover:underline">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{email}</span>
                </a>
              )}
              {chart && (
                <span className="capitalize">
                  {[age(chart.dateOfBirth), sexOf(chart.gender)].filter((v) => v !== "—").join(" · ") || "—"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* What this patient has and has not got, at a glance — each its own
            chip, the colour carrying the answer. */}
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          {predictOwned ? (
            <>
              {hasLogin && chart && <ViewDashboardButton patientId={chart.id} />}
              {/* The whole dashboard as a printable report (Print / Save as PDF). */}
              {chart && (biomarkerCount > 0 || reports.length > 0) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  nativeButton={false}
                  render={<a href={`/health-report/${chart.id}`} target="_blank" rel="noreferrer" />}
                >
                  <Printer className="h-3.5 w-3.5" /> Print report
                </Button>
              )}
              <Chip ok={hasLogin} icon={hasLogin ? UserCheck : UserX} yes="Login" no="No login" />
              <Chip
                ok={reports.length > 0}
                icon={FileText}
                yes={`${reports.length} report${reports.length === 1 ? "" : "s"}`}
                no="No reports"
              />
              <Chip
                ok={biomarkerCount > 0}
                icon={Droplet}
                yes={`Blood test · ${biomarkerCount} markers`}
                no="No blood test"
              />
            </>
          ) : (
            // A treatment clinic: the login, reports and blood test are
            // Predict's. One line says whether this patient went to Predict.
            (predictReferral || reports.length > 0 || biomarkerCount > 0) && (
              <Chip
                ok
                icon={Send}
                // A referral says where it stands; a test done before referrals
                // were recorded is just that — tested, not referred.
                yes={predictReferral ? (REFERRAL_LABEL[predictReferral] ?? "Referred to Predict") : "Tested by Predict"}
                no=""
              />
            )
          )}
        </div>
      </div>

      <RecordTabs tabs={tabs} active={tab} onChange={setTab} />

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <RecordSection
            title="Patient details"
            icon={UserRound}
            action={
              // Another clinic's patient: their details are that clinic's to edit.
              crossClinic ? null : (
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setEditing((open) => !open)}>
                  {editing ? "Close" : "Edit"}
                </Button>
              )
            }
          >
            {editing ? (
              <DetailsForm
                id={id}
                name={name}
                phone={phone ?? ""}
                email={email ?? ""}
                dateOfBirth={chart && !chart.dateOfBirth.startsWith("1900-") ? chart.dateOfBirth : ""}
                gender={chart && isGenderKnown(chart.gender) ? chart.gender : ""}
                bloodGroup={chart?.bloodGroup ?? ""}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false)
                  load()
                }}
              />
            ) : (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                <Fact label="Patient id" value={chart?.patientCode} mono />
                <Fact label="Full name" value={displayName(name)} />
                <Fact label="Date of birth" value={chart && !chart.dateOfBirth.startsWith("1900-") ? chart.dateOfBirth : null} />
                <Fact label="Age" value={chart ? age(chart.dateOfBirth) : null} />
                <Fact label="Sex" value={chart ? sexOf(chart.gender) : null} />
                <Fact label="Mobile" value={phone} />
                <Fact label="Email" value={email} />
                <Fact label="Blood group" value={chart?.bloodGroup} />
                <Fact label="Stage" value={person ? stageLabel(person.stage) : null} />
              </dl>
            )}
          </RecordSection>

          {/* Diagnosis is Predict's: refer with consent, and see what comes back. */}
          {/* Only for a treatment clinic sending patients to Predict. Inside
              Predict the patient is already Predict's — results are on Lab. */}
          {chart && !predictOwned && <PredictReferralPanel patientId={chart.id} />}

          {/* The patient-app sign-in link — makes the login from the mobile if there is none. */}
          {/* The app login is Predict's to give — made by the referral above. */}
          {chart && predictOwned && <LoginLinkPanel patientId={chart.id} patientName={name} />}

          {hasLogin && (chart?.userId || person?.userId) && (
            <CarePlanPanel userId={(chart?.userId ?? person?.userId)!} />
          )}
        </div>
      )}

      {/* ── Visits: the list, and the forms of the one chosen ─────────────── */}
      {tab === "visits" && person && (
        <div className="flex flex-col gap-4">
          <RecordSection
            title="Visits"
            icon={CalendarDays}
            action={
              <Button size="sm" className="h-7 px-2.5 text-xs" onClick={startVisit}>
                <Plus className="size-3.5" /> Start a visit
              </Button>
            }
          >
            {visits.length === 0 ? (
              <RecordEmpty>No visits on record.</RecordEmpty>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {visits.map((v) => {
                  const on = v.id === visitId
                  return (
                    <li key={v.id}>
                      <div
                        className={`flex items-center gap-3 rounded-lg px-2 py-2 ${
                          on ? "bg-primary/[0.07]" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        <button type="button" onClick={() => setVisitId(v.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <span className={`size-1.5 shrink-0 rounded-full ${on ? "bg-primary" : "bg-black/15 dark:bg-white/20"}`} />
                          <span className="min-w-0 flex-1 truncate text-sm">{recordDateTime(v.scheduledAt)}</span>
                          <span className="hidden text-xs capitalize text-black/55 sm:inline dark:text-white/40">
                            {v.type.replaceAll("_", " ")}
                          </span>
                          <RecordBadge tone={VISIT_TONE[v.status] ?? "neutral"}>{v.status.replaceAll("_", " ")}</RecordBadge>
                        </button>
                        <Link
                          href={`/appointments/${v.id}`}
                          title="Open the appointment"
                          className="rounded p-1 text-black/40 hover:text-black/80 dark:text-white/35 dark:hover:text-white/80"
                        >
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </RecordSection>

          <RecordSection title="Visit forms" icon={ClipboardList}>
            <PatientConsult
              contactId={person.id}
              patientName={name}
              visits={visits}
              visitId={visitId ?? ""}
              onStartVisit={startVisit}
            />
          </RecordSection>
        </div>
      )}

      {/* ── Nutrition: what they told us, the consult, the plan, how they keep to it ── */}
      {tab === "nutrition" && person && (
        <div className="flex flex-col gap-3">
          <RecordSegments<NutritionPart>
            segments={[
              { key: "consult", label: "Consult" },
              { key: "diet", label: "Diet plan" },
              { key: "questionnaire", label: "Patient questionnaire" },
              { key: "checkins", label: "Diet check-ins" },
            ]}
            active={nutritionPart}
            onChange={setNutritionPart}
          />
          {/* Asked once and corrected over time, so not tied to a visit. */}
          {nutritionPart === "consult" && (
            <VisitForms key={`nutrition-${person.id}`} formKey="nutrition_consult" appointmentId={null} contactId={person.id} patientName={name} />
          )}
          {nutritionPart === "diet" && (
            <DietProtocolEditor contactId={person.id} />
          )}
          {nutritionPart === "questionnaire" && (
            <PatientIntakeAnswers contactId={person.id} />
          )}
          {nutritionPart === "checkins" && (
            <RecordSection title="Diet check-ins" icon={CalendarDays}>
              <CheckinLog contactId={person.id} kinds={["diet"]} />
            </RecordSection>
          )}
        </div>
      )}

      {/* ── Summary: everything found, to walk the patient through ── */}
      {tab === "summary" && person && <PatientSummaryPanel contactId={person.id} />}

      {/* ── Exercise & VALD ─────────────────────────────────────────────── */}
      {tab === "exercise" && person && <ExerciseAndVald contactId={person.id} patientId={chart?.id ?? null} />}

      {/* ── Treatment: the course, its medicines, and the daily medicine check-in ── */}
      {tab === "treatment" && person && (
        <div className="flex flex-col gap-3">
          <RecordSegments<TreatmentPart>
            segments={[
              { key: "course", label: "Course & sittings" },
              { key: "medicines", label: "Medicines" },
              { key: "checkins", label: "Medicine check-ins" },
            ]}
            active={treatmentPart}
            onChange={setTreatmentPart}
          />
          {treatmentPart === "course" && <TherapyPanel contactId={person.id} />}
          {treatmentPart === "medicines" && <MedicinesPanel contactId={person.id} onSold={load} />}
          {treatmentPart === "checkins" && (
            <RecordSection title="Medicine check-ins" icon={CalendarDays}>
              <CheckinLog contactId={person.id} kinds={["medicine"]} />
            </RecordSection>
          )}
        </div>
      )}

      {/* ── Billing ─────────────────────────────────────────────────────── */}
      {tab === "billing" && (
        <div className="flex flex-col gap-4">
          {payments.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              <RecordStat
                label="Paid in total"
                value={formatPrice(livePayments.reduce((n, p) => n + p.amountInPaise, 0))}
                sub={`${livePayments.length} receipt${livePayments.length === 1 ? "" : "s"}`}
              />
              <RecordStat
                label="Last payment"
                value={recordDate(livePayments[0]?.collectedAt)}
                sub={livePayments[0] ? formatPrice(livePayments[0].amountInPaise) : undefined}
              />
              <RecordStat
                label="Cancelled"
                value={String(payments.length - livePayments.length)}
                sub="voided receipts"
              />
            </div>
          )}
          {person && <BillingAccessNote />}
          {/* What is owed on their courses, collected here as on the course. */}
          {/* Everything owed in one sum — course balance, medicine on credit, visit fees. */}
          {person && <PatientDues contactId={person.id} onChanged={load} />}
          {person && <CoursePayments contactId={person.id} onChanged={load} />}
          <RecordSection title="Payments" icon={Wallet}>
            {payments.length === 0 ? (
              <RecordEmpty>Nothing collected from this patient yet.</RecordEmpty>
            ) : (
              <RecordTable
                head={["Date", "Receipt", "For", "Amount", ""]}
                align={["left", "left", "left", "right", "right"]}
                rowKey={(i) => payments[i]!.id}
                rows={payments.map((p) => [
                  <span key="d" className="whitespace-nowrap">{recordDate(p.collectedAt)}</span>,
                  <span key="r" className={`font-mono text-xs ${p.voidedAt ? "line-through opacity-60" : ""}`}>
                    {p.receiptNo ?? "—"}
                  </span>,
                  <span key="f" className="text-xs capitalize text-black/65 dark:text-white/50">
                    {p.kind.replaceAll("_", " ")} · {p.method}
                    {p.voidedAt && (
                      <span className="block normal-case text-red-700 dark:text-red-400">
                        cancelled{p.voidReason ? ` — ${p.voidReason}` : ""}
                      </span>
                    )}
                  </span>,
                  <span key="a" className={`font-medium ${p.voidedAt ? "line-through opacity-60" : ""}`}>
                    {formatPrice(p.amountInPaise)}
                  </span>,
                  <a key="l" href={`/receipt/${p.id}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
                    Receipt
                  </a>,
                ])}
              />
            )}
          </RecordSection>
        </div>
      )}

      {/* ── Lab: results, and the tests and reports they came from ──────── */}
      {tab === "lab" && (
        <div className="flex flex-col gap-3">
          <RecordSegments<LabPart>
            segments={[
              { key: "results", label: "Results & biological age" },
              { key: "tests", label: "Tests & reports", count: reports.length },
            ]}
            active={labPart}
            onChange={setLabPart}
          />

          {labPart === "results" && (
            <RecordSection
              title="Blood work and biological age"
              icon={Droplet}
              action={
                chart && (
                  <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => setEnteringValues(true)}>
                    Enter values
                  </Button>
                )
              }
            >
              {!chart ? (
                noChart("Results")
              ) : (
                <div className="flex flex-col gap-4">
                  <BiologicalAgeIndexPicker
                    patientId={chart.id}
                    refreshKey={bloodWorkVersion}
                    onChanged={() => setBloodWorkVersion((v) => v + 1)}
                  />
                  <BiomarkerHistory key={bloodWorkVersion} patientId={chart.id} />
                </div>
              )}
            </RecordSection>
          )}

          {labPart === "tests" && (
            <>
              <RecordSection title="Blood tests" icon={FlaskConical}>
                {!chart ? (
                  noChart("Tests")
                ) : (
                  <BloodTests
                    patientId={chart.id}
                    loginId={loginId}
                    // Values entered from an uploaded sheet land in Results,
                    // which holds its own copy of the readings.
                    onResultsChanged={() => setBloodWorkVersion((v) => v + 1)}
                    onEnterValues={(order) => setEnteringValues(order ? { orderId: order.id } : true)}
                  />
                )}
              </RecordSection>

              <RecordSection
                title="Other reports"
                icon={FileText}
                action={
                  // A chart is all it takes. The account only decides whether the
                  // patient can also see the report in their own app.
                  chart && (
                    <>
                      {/* The way in for a panel that arrived as a scan or a sheet of
                          paper, which is most of them — the parser only ever read a
                          machine-readable PDF, so those patients had no biomarkers
                          at all. */}
                      <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setEnteringValues(true)}>
                        Enter values
                      </Button>
                      {/* Two buttons rather than one with a picker: which report it
                          is decides what happens to it. Only the Final feeds the
                          biological age — an Initial is provisional and must never
                          reach the algorithm. */}
                      <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => setUploading("initial")}>
                        Upload initial
                      </Button>
                      <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => setUploading("final")}>
                        Upload final
                      </Button>
                    </>
                  )
                }
              >
                {!chart ? (
                  noChart("Reports")
                ) : reports.length === 0 ? (
                  <RecordEmpty>Nothing uploaded outside a blood test.</RecordEmpty>
                ) : (
                  <ul className="-mx-2 flex flex-col">
                    {reports.map((r) => (
                      <li key={r.id}>
                        <a
                          href={r.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                        >
                          <span className="flex items-center gap-2 capitalize">
                            <FileText className="size-3.5 text-black/40 dark:text-white/35" />
                            {r.reportType ?? "Report"}
                          </span>
                          <span className="text-xs text-black/55 dark:text-white/40">{recordDate(r.uploadedAt)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </RecordSection>
            </>
          )}
        </div>
      )}

      {/* ── Notes & files ───────────────────────────────────────────────── */}
      {tab === "notes" && (
        <div className="flex flex-col gap-4">
          {person && <PatientNotes contactId={person.id} />}
          <RecordSection title="Files" icon={FolderOpen}>
            {person ? (
              <DocumentsPanel url={`/api/staff/people/${person.id}/documents`} />
            ) : (
              <RecordEmpty>This record has no contact yet, so files cannot be filed on it.</RecordEmpty>
            )}
          </RecordSection>
        </div>
      )}

      {starting && (
        <StartVisitDialog target={starting} onClose={() => setStarting(null)} onDone={load} />
      )}

      {/* No appointment passed: a lab printout brought in by the patient
          belongs to them, not to a particular visit. The server only attaches
          one when it is given and verified. */}
      {enteringValues && chart && (
        <ManualBiomarkerEntry
          patientId={chart.id}
          patientName={person?.name ?? chart.patientCode ?? "Patient"}
          initialOrderId={typeof enteringValues === "object" ? enteringValues.orderId : undefined}
          onClose={() => setEnteringValues(false)}
          onSaved={() => {
            setBloodWorkVersion((v) => v + 1)
            load()
          }}
        />
      )}

      {uploading && chart && (
        <UploadReportModal
          open
          reportType={uploading}
          // The account when there is one — that is what lets the patient read
          // it in their own app, and what the biomarker parsing keys on.
          // Otherwise the chart, which every patient has.
          patientId={loginId ?? undefined}
          chartId={chart.id}
          onClose={() => setUploading(null)}
          onUploaded={load}
          onEnterValues={() => {
            setUploading(null)
            setEnteringValues(true)
          }}
        />
      )}
    </div>
  )
}

/**
 * Open the patient's dashboard in a new tab, as they see it — through a
 * ten-minute link that leaves the one they were sent alone.
 */
function ViewDashboardButton({ patientId }: { patientId: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2 text-xs"
      disabled={busy}
      title="Opens their dashboard in a new tab, signed in as them, for 10 minutes"
      onClick={async () => {
        // Opened before the request so the browser does not block it as a pop-up.
        const tab = window.open("about:blank", "_blank")
        setBusy(true)
        try {
          const res = await fetch(`/api/staff/patients/${patientId}/login-link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "preview" }),
          })
          const data = await res.json().catch(() => null)
          if (res.ok && data?.url && tab) tab.location.href = data.url
          else {
            tab?.close()
            alert(data?.error ?? "Could not open the dashboard")
          }
        } finally {
          setBusy(false)
        }
      }}
    >
      <ExternalLink className="h-3.5 w-3.5" />
      View dashboard
    </Button>
  )
}

/**
 * One fact, in one chip: green when it is there, red when it is not.
 *
 * Small on purpose. These are read at a glance while somebody is standing at
 * the counter, so the colour does the work and the words only name which fact
 * it is — not what it means or what to do about it.
 */
function Chip({
  ok,
  icon: Icon,
  yes,
  no,
}: {
  ok: boolean
  icon: React.ComponentType<{ className?: string }>
  yes: string
  no: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
          : "border-red-500/25 bg-red-500/[0.06] text-red-700 dark:text-red-400"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {ok ? yes : no}
    </span>
  )
}
