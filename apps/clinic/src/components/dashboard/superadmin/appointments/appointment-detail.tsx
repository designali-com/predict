"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import { toast } from "@workspace/ui/components/sonner"
import { useSearchParams } from "next/navigation"
import {
  Activity,
  Bluetooth,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  FileText,
  FolderOpen,
  Pill,
  Send,
  ShieldCheck,
  StickyNote,
  Stethoscope,
  Upload,
  User,
  Video,
  Wallet,
} from "lucide-react"
import { UploadReportModal } from "./upload-report-modal"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Fact,
  RecordBadge,
  RecordEmpty,
  RecordSection,
  RecordSegments,
  RecordTabs,
  type RecordTab,
} from "@/src/components/dashboard/patients/record-ui"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { VisitForms } from "@/src/components/dashboard/forms/visit-forms"
import { FeePanel } from "@/src/components/dashboard/billing/fee-panel"
import { BillingAccessNote, CoursePayments } from "@/src/components/dashboard/billing/course-payments"
import { PatientDues } from "@/src/components/dashboard/billing/patient-dues"
import { MedicineSale } from "@/src/components/dashboard/billing/medicine-sale"
import { TherapyPanel } from "@/src/components/dashboard/treatment-plans/therapy-panel"
import { waitingMinutes } from "@workspace/db/arrival"
import { ExerciseProtocolEditor } from "@/src/components/dashboard/patients/exercise-protocol-editor"
import { EditPatientDetails } from "@/src/components/dashboard/patients/patient-details-form"
import { DocumentsPanel } from "@workspace/ui/components/documents-panel"
import { ValdRunner } from "@/src/components/dashboard/patients/vald-runner"
import { sexLetter } from "@/src/lib/display-name"
import { ValdTests } from "@/src/components/dashboard/patients/vald-tests"
import { EmgPanel } from "@/src/components/dashboard/patients/emg-recordings"

interface AppointmentNoteData {
  id: string
  content: string
  authorName: string
  authorRole: string
  createdAt: string
}

interface RegistrationAnswers {
  first_name?: string | null
  last_name?: string | null
  phone_no?: string | null
  sex?: string | null
  dob?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  pin_code?: string | null
}

interface AppointmentDetailData {
  appointment: {
    id: string
    contactId: string
    type: string
    scheduledAt: string
    status: string
    notes: string | null
    calBookingUid: string | null
    channel: string | null
    meetingLocation: string | null
    feeInPaise?: number
    /** When they walked in. Null until they do — see @workspace/db/arrival. */
    arrivedAt: string | null
  }
  /** What this visit IS — therapy, consultation or review. Derived. */
  kind: { kind: string; label: string; detail: string; consumesSitting: boolean } | null
  patient: { id: string; name: string; email: string } | null
  contact: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    stage: string | null
  } | null
  lead: { name: string | null; phone: string | null; email: string | null } | null
  registration: { status: string; answers: RegistrationAnswers | null } | null
  doctor: { id: string; name: string } | null
  reports: {
    id: string
    fileUrl: string
    fileName: string | null
    reportType: string | null
    uploadedAt: string
  }[]
  notes: AppointmentNoteData[]
  /** Where the visit has got to — derived, see @workspace/db/visit-workflow. */
  visit?: { stage: string | null; pendingFormKeys: string[]; facts?: { feePaid?: boolean } } | null
}

const TYPE_LABELS: Record<string, string> = {
  consultation: "Consultation",
  review: "Review",
}

const AUTHOR_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  superadmin: "Super Admin",
  doctor: "Doctor",
  health_coach: "Health Coach",
  nutritionist: "Nutritionist",
}

/**
 * Roles are rows in a table now, not an enum, so this map cannot know every
 * one of them — a note left by a Therapist would otherwise be stamped
 * "therapist". Known roles keep their nicer wording; anything else is derived
 * from the key rather than shown raw.
 */
function authorRoleLabel(role: string): string {
  return (
    AUTHOR_ROLE_LABELS[role] ??
    role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

const FORM_TABS = [
  { key: "registration_front_desk", label: "Registration" },
  { key: "registration_clinical", label: "History" },
  { key: "questionnaire", label: "Questionnaires" },
  { key: "measurements", label: "Measurements" },
  { key: "provisional_diagnosis", label: "Diagnosis" },
  { key: "nutrition_consult", label: "Nutrition" },
] as const
type FormKey = (typeof FORM_TABS)[number]["key"]

/**
 * Five tabs, one per job at the visit. There were thirteen: each form was a tab
 * of its own, and notes, reports and documents were three places to look for
 * one thing. The forms are now parts of Forms, the package and the exercise
 * prescription parts of Treatment, the written things parts of Notes & files.
 */
type VisitTab = "visit" | "forms" | "vald" | "treatment" | "billing" | "notes"
type TreatmentPart = "package" | "exercise"
type NotesPart = "notes" | "reports" | "documents"

const VISIT_TABS: Omit<RecordTab<VisitTab>, "count">[] = [
  { key: "visit", label: "Visit", icon: CalendarDays },
  { key: "forms", label: "Forms", icon: ClipboardList },
  // The DynaMo tests are part of the consultation, so they are run here.
  { key: "vald", label: "VALD & EMG", icon: Activity },
  { key: "treatment", label: "Treatment", icon: Pill },
  { key: "billing", label: "Billing", icon: Wallet },
  { key: "notes", label: "Notes & files", icon: StickyNote },
]

const TAB_ALIASES: Record<string, VisitTab> = {
  visit: "visit",
  forms: "forms",
  vald: "vald",
  tests: "vald",
  emg: "vald",
  treatment: "treatment",
  therapy: "treatment",
  exercise: "treatment",
  billing: "billing",
  notes: "notes",
}

// One desk control. Arrival is not a status in the database — it is the
// time they walked in — but the desk should not see that as a second button.
// Confirmed = booking stands, they are not here yet.
// Arrived = in the clinic, visit still open (waiting time starts).
// Visited = the visit is finished.
const DESK_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "arrived", label: "Arrived" },
  { value: "completed", label: "Visited" },
  { value: "no_show", label: "Not visited" },
  { value: "cancelled", label: "Cancelled" },
] as const

// A video call has nobody to mark as walked in, and "Visited" is the wrong
// word for it. In consultation is the stage that replaces both.
const VIRTUAL_DESK_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_consultation", label: "In consultation" },
  { value: "completed", label: "Consulted" },
  { value: "no_show", label: "Missed the call" },
  { value: "cancelled", label: "Cancelled" },
] as const

function isVirtualVisit(channel: string | null | undefined, meetingLocation: string | null | undefined) {
  if (channel === "virtual") return true
  if (channel === "in_clinic") return false
  return /online|video call|meet\.google/i.test(meetingLocation ?? "")
}

function visitMode(channel: string | null | undefined, meetingLocation: string | null | undefined) {
  if (channel === "virtual" || isVirtualVisit(channel, meetingLocation)) return "Virtual"
  if (channel === "in_clinic") return "Clinic"
  return null
}

function deskValue(status: string, arrivedAt: string | null, virtual: boolean) {
  if (virtual) return status
  if (arrivedAt && (status === "scheduled" || status === "confirmed")) return "arrived"
  return status
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

// datetime-local inputs need local-time "YYYY-MM-DDTHH:mm", not ISO/UTC.
function formatPhone(phone: string | null | undefined) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10)
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1)
  if (digits.length === 10) return digits
  return digits || phone
}

function formatFee(paise: number | undefined, paid: boolean) {
  if ((paise ?? 0) === 0) return "Free"
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((paise ?? 0) / 100)
  return paid ? `${amount} paid` : `${amount} due`
}

function filled(...parts: Array<unknown>) {
  const text = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(", ")
  return text || null
}

function toDateTimeLocalValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface AppointmentDetailProps {
  appointmentId: string
}

export function AppointmentDetail({ appointmentId }: AppointmentDetailProps) {
  const [data, setData] = useState<AppointmentDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // The tab, and the part of it, live in the address so a refresh or a link
  // sent to a colleague opens where it was. Old tab names still arrive from
  // bookmarks, and each lands on the tab that now holds it.
  const searchParams = useSearchParams()
  const [initialTab, initialFormPart, initialNotesPart] = (() => {
    const asked = (searchParams.get("tab") ?? "").toLowerCase()
    const form = FORM_TABS.find((f) => f.key === asked)
    if (form) return ["forms", form.key, "notes"] as const
    if (asked === "reports" || asked === "documents") return ["notes", "registration_front_desk", asked] as const
    return [TAB_ALIASES[asked] ?? "visit", "registration_front_desk", "notes"] as const
  })()
  const [requestedTab, setTabState] = useState<VisitTab>(initialTab)
  const [formPart, setFormPart] = useState<FormKey>(initialFormPart)
  const [notesPart, setNotesPart] = useState<NotesPart>(initialNotesPart)
  // Bumped after a DynaMo test is saved, so the history below reloads.
  const [valdVersion, setValdVersion] = useState(0)
  // Inside the VALD tab: the DynaMo tests, or EMG. EMG stays mounted once opened, so a recording survives switching back.
  const [valdPart, setValdPartState] = useState<"vald" | "emg">("vald")
  const [emgOpened, setEmgOpened] = useState(false)
  const setValdPart = (p: "vald" | "emg") => {
    if (p === "emg") setEmgOpened(true)
    setValdPartState(p)
  }
  // The DynaMo runner stays shut until somebody is about to test — the tab
  // opens on the past results, not on a device panel.
  const [performing, setPerforming] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [treatmentPart, setTreatmentPart] = useState<TreatmentPart>(searchParams.get("tab") === "exercise" ? "exercise" : "package")
  const setTab = useCallback((key: VisitTab) => {
    setTabState(key)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", key)
    window.history.replaceState(window.history.state, "", url)
  }, [])
  const [noteText, setNoteText] = useState("")
  const [addingNote, setAddingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleValue, setRescheduleValue] = useState("")
  const [savingReschedule, setSavingReschedule] = useState(false)
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)
  const [uploadReportType, setUploadReportType] = useState<"initial" | "final" | null>(null)
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)

  const fetchDetail = useCallback(() => {
    return fetch(`/api/staff/appointments/${appointmentId}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true)
          return
        }
        setData(await res.json())
      })
      .finally(() => setLoading(false))
  }, [appointmentId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteText.trim()) return

    setAddingNote(true)
    setNoteError(null)
    try {
      const res = await fetch(`/api/staff/appointments/${appointmentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteText.trim() }),
      })
      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || "Failed to add note")

      setNoteText("")
      await fetchDetail()
    } catch (err: any) {
      setNoteError(err.message || "Failed to add note")
    } finally {
      setAddingNote(false)
    }
  }

  const isTherapy = data?.kind?.kind === "therapy"

  async function handleDeskChange(next: string) {
    const appointment = data?.appointment
    const virtual = isVirtualVisit(appointment?.channel, appointment?.meetingLocation)
    if (!appointment || next === deskValue(appointment.status, appointment.arrivedAt, virtual)) return

    const body: { status?: string; arrived?: boolean } = {}
    if (next === "arrived") {
      body.arrived = true
      if (appointment.status !== "confirmed") body.status = "confirmed"
    } else if (next === "completed") {
      body.status = "completed"
      if (!virtual && !appointment.arrivedAt) body.arrived = true
    } else {
      body.status = next
      if (appointment.arrivedAt) body.arrived = false
    }

    setUpdatingStatus(true)
    setStatusError(null)
    try {
      const res = await fetch(`/api/staff/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || "Failed to update status")
      await fetchDetail()
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : "Failed to update status")
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleConvert() {
    setConverting(true)
    setConvertError(null)
    try {
      const res = await fetch(`/api/staff/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convertToPatient: true }),
      })
      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || "Could not convert this person")
      await fetchDetail()
    } catch (err: unknown) {
      setConvertError(err instanceof Error ? err.message : "Could not convert this person")
    } finally {
      setConverting(false)
    }
  }

  async function handleReschedule() {
    if (!rescheduleValue) return
    setSavingReschedule(true)
    setRescheduleError(null)
    try {
      const res = await fetch(`/api/staff/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: new Date(rescheduleValue).toISOString() }),
      })
      const responseData = await res.json()
      if (!res.ok) throw new Error(responseData.error || "Failed to reschedule")
      setRescheduling(false)
      await fetchDetail()
    } catch (err: unknown) {
      setRescheduleError(err instanceof Error ? err.message : "Failed to reschedule")
    } finally {
      setSavingReschedule(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-black/65 dark:text-white/40">
        <ShieldCheck className="h-8 w-8 opacity-20" />
        <span className="text-sm">Appointment not found</span>
      </div>
    )
  }

  const { appointment, patient, contact, lead, doctor, notes, registration } = data
  const notesNewestFirst = [...(notes ?? [])].reverse()
  const answers = registration?.answers ?? {}
  const personName =
    patient?.name ??
    contact?.name ??
    lead?.name ??
    filled(answers.first_name, answers.last_name) ??
    "—"
  const personPhone = formatPhone(contact?.phone ?? lead?.phone ?? answers.phone_no)
  const personEmail = patient?.email ?? contact?.email ?? lead?.email ?? null
  const address = filled(answers.address_line1, answers.address_line2, answers.city, answers.state, answers.pin_code)
  const pending = new Set(data.visit?.pendingFormKeys ?? [])
  // A cancelled or missed visit is not charged — nothing to collect.
  const feeWaived = appointment.status === "cancelled" || appointment.status === "no_show"
  const feeDue = !isTherapy && !feeWaived && !data.visit?.facts?.feePaid && (appointment.feeInPaise ?? 0) > 0
  // A therapy day has no consultation forms, so it has no Forms tab — and an
  // old link to one lands on the visit instead.
  const tab: VisitTab = isTherapy && requestedTab === "forms" ? "visit" : requestedTab
  const tabs: RecordTab<VisitTab>[] = VISIT_TABS.filter((t) => !(isTherapy && t.key === "forms")).map((t) => ({
    ...t,
    count:
      t.key === "forms"
        ? FORM_TABS.filter((f) => pending.has(f.key)).length
        : t.key === "notes"
          ? notes.length + (data.reports?.length ?? 0)
          : undefined,
  }))
  const openForm = (key: FormKey) => {
    setFormPart(key)
    setTab("forms")
  }

  const mode = visitMode(appointment.channel, appointment.meetingLocation)

  return (
    <div className="flex flex-col gap-3 p-4 text-black lg:p-6 dark:text-white">
      {patient && (
        <UploadReportModal
          open={uploadReportType !== null}
          reportType={uploadReportType ?? "initial"}
          patientId={patient.id}
          appointmentId={appointment.id}
          onClose={() => setUploadReportType(null)}
          onUploaded={fetchDetail}
        />
      )}

      <div className="rounded-xl border border-black/10 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-black">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{personName}</p>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  mode === "Virtual"
                    ? "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
                    : mode === "Clinic"
                      ? "bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                }`}
              >
                {mode === "Virtual" ? <Video className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                {mode ?? "Mode not set"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{formatDateTime(appointment.scheduledAt)}</p>
            <p className="text-xs text-black/65 dark:text-white/45">
              {data.kind?.detail ?? TYPE_LABELS[appointment.type] ?? appointment.type}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              {contact && contact.stage !== "PATIENT" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleConvert}
                  disabled={converting}
                >
                  {converting ? <PredictSpinner className="size-4" /> : "Convert to patient"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRescheduleValue(toDateTimeLocalValue(appointment.scheduledAt))
                  setRescheduleError(null)
                  setRescheduling((open) => !open)
                }}
              >
                Reschedule
              </Button>
              <Select
                value={deskValue(appointment.status, appointment.arrivedAt, isVirtualVisit(appointment.channel, appointment.meetingLocation))}
                onValueChange={(value) => handleDeskChange(value as string)}
                disabled={updatingStatus}
              >
                <SelectTrigger
                  size="sm"
                  className="rounded-full text-[11px] font-semibold uppercase tracking-wider"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isVirtualVisit(appointment.channel, appointment.meetingLocation) ? VIRTUAL_DESK_OPTIONS : DESK_OPTIONS).map((o) => {
                    const waiting = !isVirtualVisit(appointment.channel, appointment.meetingLocation) && deskValue(appointment.status, appointment.arrivedAt, false) === "arrived" ? waitingMinutes(appointment.arrivedAt) : null
                    const label = o.value === "arrived" && waiting !== null && waiting > 0 ? `Arrived · ${waiting} min` : o.label
                    return (
                      <SelectItem key={o.value} value={o.value}>
                        {label}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            {(convertError || statusError) && (
              <span className="text-xs text-destructive">{convertError || statusError}</span>
            )}
          </div>
        </div>
        {rescheduling && (
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-black/10 pt-3 dark:border-white/10">
            <label className="flex flex-col gap-1 text-[11px] text-black/55 dark:text-white/45">
              Date
              <Input
                type="date"
                value={rescheduleValue.slice(0, 10)}
                onChange={(e) => setRescheduleValue(`${e.target.value}T${rescheduleValue.slice(11, 16) || "00:00"}`)}
                className="h-8 w-auto"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-black/55 dark:text-white/45">
              Time
              <Input
                type="time"
                value={rescheduleValue.slice(11, 16)}
                onChange={(e) => setRescheduleValue(`${rescheduleValue.slice(0, 10)}T${e.target.value}`)}
                className="h-8 w-auto"
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="simple"
              onClick={handleReschedule}
              disabled={savingReschedule || rescheduleValue.length < 16}
            >
              {savingReschedule ? <PredictSpinner className="size-4" /> : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setRescheduling(false)
                setRescheduleError(null)
              }}
            >
              Cancel
            </Button>
            {rescheduleError && <p className="w-full text-xs text-red-500">{rescheduleError}</p>}
          </div>
        )}
      </div>

      <RecordTabs tabs={tabs} active={tab} onChange={setTab} />

      {/* ── Visit: who, with whom, and what is still to fill ──────────────── */}
      {tab === "visit" && (
        <div className="flex flex-col gap-4">
          <RecordSection
            title="Visit"
            icon={CalendarDays}
            action={
              <div className="flex items-center gap-2">
                {feeDue && <RecordBadge tone="warn">Fee to collect</RecordBadge>}
                {/* The patient's own details, edited here rather than a trip to
                    their record — the desk usually finds the typo at the visit. */}
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setEditingProfile((open) => !open)}>
                  {editingProfile ? "Close" : "Edit profile"}
                </Button>
              </div>
            }
          >
            {editingProfile && (
              <div className="mb-4 border-b border-black/[0.06] pb-4 dark:border-white/[0.06]">
                <EditPatientDetails
                  patientId={appointment.contactId}
                  onCancel={() => setEditingProfile(false)}
                  onSaved={() => {
                    setEditingProfile(false)
                    toast.success("Profile updated")
                    void fetchDetail()
                  }}
                />
              </div>
            )}
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.12em] text-black/45 uppercase dark:text-white/35">Name</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-sm">
                  <User className="size-3.5 text-black/40 dark:text-white/35" />
                  <span className="truncate">{personName}</span>
                  {!patient && <RecordBadge>Not onboarded</RecordBadge>}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.12em] text-black/45 uppercase dark:text-white/35">Doctor</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-sm">
                  <Stethoscope className="size-3.5 text-black/40 dark:text-white/35" />
                  {doctor?.name ?? "Unassigned"}
                </dd>
              </div>
              <Fact label="Mobile" value={personPhone} mono />
              <Fact label="Email" value={personEmail} />
              <Fact
                label="Age / sex"
                value={
                  [
                    typeof answers.dob === "string" && !Number.isNaN(Date.parse(answers.dob))
                      ? new Date(answers.dob).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      : null,
                    typeof answers.sex === "string" ? (sexLetter(answers.sex) ?? answers.sex) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || null
                }
              />
              <Fact label="Fee" value={feeWaived ? "Not charged" : formatFee(appointment.feeInPaise, Boolean(data.visit?.facts?.feePaid))} />
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.12em] text-black/45 uppercase dark:text-white/35">Mode</dt>
                <dd className="mt-0.5 text-sm">{mode ?? "Not set"}</dd>
                {mode === "Virtual" && appointment.meetingLocation && /^https?:\/\//i.test(appointment.meetingLocation) && (
                  <a href={appointment.meetingLocation} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-xs text-primary hover:underline">
                    {appointment.meetingLocation}
                  </a>
                )}
              </div>
              <Fact label="Address" value={address} />
            </dl>

            {appointment.notes && (
              <div className="mt-4 border-t border-black/[0.06] pt-3 dark:border-white/[0.06]">
                <p className="text-[10px] font-semibold tracking-[0.12em] text-black/45 uppercase dark:text-white/35">Reason for visit</p>
                <p className="mt-1 whitespace-pre-line text-sm">{appointment.notes}</p>
              </div>
            )}
          </RecordSection>

          {/* What is still to fill, each a click away — the reason most people open this tab. */}
          {!isTherapy && (
            <RecordSection title="Forms for this visit" icon={ClipboardList}>
              <ul className="-mx-2 grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
                {FORM_TABS.map((f) => {
                  const due = pending.has(f.key)
                  return (
                    <li key={f.key}>
                      <button
                        type="button"
                        onClick={() => openForm(f.key)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                      >
                        <span className="flex items-center gap-2">
                          <span className={`size-1.5 rounded-full ${due ? "bg-amber-500" : "bg-emerald-500"}`} />
                          {f.label}
                        </span>
                        <RecordBadge tone={due ? "warn" : "good"}>{due ? "to fill" : "done"}</RecordBadge>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </RecordSection>
          )}
        </div>
      )}

      {/* ── Forms: one form at a time, the unfilled ones marked ─────────────── */}
      {tab === "forms" && !isTherapy && (
        <div className="flex flex-col gap-3">
          <RecordSegments<FormKey>
            segments={FORM_TABS.map((f) => ({ key: f.key, label: pending.has(f.key) ? `${f.label} •` : f.label }))}
            active={formPart}
            onChange={setFormPart}
          />
          <VisitForms
            key={formPart}
            formKey={formPart}
            appointmentId={appointment.id}
            contactId={appointment.contactId}
            patientName={personName}
            onChanged={fetchDetail}
          />
        </div>
      )}

      {/* ── VALD: the DynaMo, run at the consultation ────────────────────────
          Filed against this visit and the patient, in our own records. */}
      {tab === "vald" && (
        <RecordSegments<"vald" | "emg">
          segments={[
            { key: "vald", label: "VALD" },
            { key: "emg", label: "EMG" },
          ]}
          active={valdPart}
          onChange={setValdPart}
        />
      )}
      {tab === "vald" && emgOpened && (
        <div className={valdPart === "emg" ? "" : "hidden"}>
          <EmgPanel patientId={appointment.contactId} appointmentId={appointment.id} />
        </div>
      )}
      {tab === "vald" && valdPart === "vald" && (
        <div className="flex flex-col gap-4">
          <RecordSection
            title="VALD test"
            icon={Bluetooth}
            action={
              performing ? (
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setPerforming(false)}>
                  Close
                </Button>
              ) : (
                <Button size="sm" className="h-8" onClick={() => setPerforming(true)}>
                  <Bluetooth className="h-4 w-4" />
                  Perform test
                </Button>
              )
            }
          >
            {performing ? (
              <ValdRunner patientId={appointment.contactId} appointmentId={appointment.id} onSaved={() => setValdVersion((v) => v + 1)} />
            ) : null}
          </RecordSection>
          <RecordSection title="Tests" icon={Activity}>
            <ValdTests key={valdVersion} patientId={appointment.contactId} />
          </RecordSection>
        </div>
      )}

      {/* ── Treatment: the package and the exercise prescription ─────────────
          Both are the patient's, not this visit's — the same ones as on their
          record — but they are decided here, at the end of the consult. */}
      {tab === "treatment" && (
        <div className="flex flex-col gap-3">
          <RecordSegments<TreatmentPart>
            segments={[
              { key: "package", label: "Package & sittings" },
              { key: "exercise", label: "Exercise prescription" },
            ]}
            active={treatmentPart}
            onChange={setTreatmentPart}
          />
          {treatmentPart === "package" && (
            <TherapyPanel contactId={appointment.contactId} appointmentId={appointment.id} onChanged={fetchDetail} />
          )}
          {treatmentPart === "exercise" && (
            <ExerciseProtocolEditor contactId={appointment.contactId} asSection />
          )}
        </div>
      )}

      {/* ── Billing ─────────────────────────────────────────────────────── */}
      {tab === "billing" && (
        <div className="flex flex-col gap-3">
          <BillingAccessNote />
          {!isTherapy && <FeePanel appointmentId={appointment.id} contactId={appointment.contactId} onPaid={fetchDetail} />}
          {/* The patient's courses — what is owed on them is collected here too. */}
          <PatientDues contactId={appointment.contactId} onChanged={fetchDetail} />
          <CoursePayments contactId={appointment.contactId} onChanged={fetchDetail} />
          <MedicineSale appointmentId={appointment.id} contactId={appointment.contactId} />
        </div>
      )}

      {/* ── Notes & files ───────────────────────────────────────────────── */}
      {tab === "notes" && (
        <div className="flex flex-col gap-3">
          <RecordSegments<NotesPart>
            segments={[
              { key: "notes", label: "Notes", count: notes.length },
              { key: "reports", label: "Reports", count: data.reports?.length ?? 0 },
              { key: "documents", label: "Documents" },
            ]}
            active={notesPart}
            onChange={setNotesPart}
          />

          {notesPart === "notes" && (
            <RecordSection title="Visit notes" icon={StickyNote}>
              <form onSubmit={handleAddNote}>
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder="Add a note about this visit…" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  {noteError && <span className="text-xs text-destructive">{noteError}</span>}
                  <Button type="submit" size="sm" variant="simple" disabled={addingNote || !noteText.trim()} className="ml-auto">
                    {addingNote ? <PredictSpinner className="size-4" /> : <Send />}
                    Add Note
                  </Button>
                </div>
              </form>
              <div className="mt-4 flex flex-col gap-4">
                {notesNewestFirst.length === 0 ? (
                  <RecordEmpty>No notes yet. The first one goes above.</RecordEmpty>
                ) : (
                  notesNewestFirst.map((n) => (
                    <div key={n.id} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-black/60 dark:text-white/45">
                        <span className="font-semibold text-black dark:text-white">{n.authorName}</span>
                        <RecordBadge>{authorRoleLabel(n.authorRole)}</RecordBadge>
                        <span className="ml-auto">{formatDateTime(n.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-line text-sm">{n.content}</p>
                    </div>
                  ))
                )}
              </div>
            </RecordSection>
          )}

          {notesPart === "reports" && (
            <RecordSection
              title="Reports"
              icon={FileText}
              action={
                patient && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button type="button" size="sm" className="h-7 px-2.5 text-xs">
                          <Upload className="size-3.5" />
                          Upload
                          <ChevronDown className="size-3.5" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setUploadReportType("initial")}>Initial Report</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setUploadReportType("final")}>Final Report</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              }
            >
              {(data.reports?.length ?? 0) === 0 ? (
                <RecordEmpty>No reports on this visit.</RecordEmpty>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {data.reports.map((report) => (
                    <li key={report.id}>
                      <a
                        href={report.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText className="size-3.5 shrink-0 text-black/40 dark:text-white/35" />
                          <span className="truncate">{report.fileName || "Report"}</span>
                        </span>
                        <RecordBadge>{report.reportType ?? "file"}</RecordBadge>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </RecordSection>
          )}

          {notesPart === "documents" && (
            <RecordSection
              title="Documents"
              icon={FolderOpen}
              description="PDFs, X-rays and photos for this person. A file uploaded here is also on their record."
            >
              <DocumentsPanel url={`/api/staff/people/${contact?.id ?? appointment.contactId}/documents`} appointmentId={appointment.id} />
            </RecordSection>
          )}
        </div>
      )}
    </div>
  )
}
