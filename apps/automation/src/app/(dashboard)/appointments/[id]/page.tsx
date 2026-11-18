"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { use, useCallback, useEffect, useState } from "react"
import { Phone, Stethoscope, MapPin, Video, CheckCircle2, UserX, XCircle, CalendarClock } from "lucide-react"
import { APPOINTMENT_TYPES, CHANNELS } from "@/src/components/book-appointment-dialog"
import { toast } from "@workspace/ui/components/sonner"
import { PageHeader } from "@workspace/ui/components/page-header"
import { DocumentsPanel } from "@workspace/ui/components/documents-panel"

interface AppointmentDetail {
  id: string
  contactId: string
  contactName: string | null
  contactPhone: string | null
  contactStage: string | null
  doctorUserId: string | null
  doctorName: string | null
  type: string
  scheduledAt: string
  status: string
  notes: string | null
  channel: string | null
  meetingLocation: string | null
  calBookingUid: string | null
  createdAt: string
  updatedAt: string
}
interface VisitNote {
  id: string
  authorRole: string
  authorName: string | null
  content: string
  createdAt: string
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  completed: "bg-muted/5 text-muted-foreground",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-amber-100 text-amber-700",
}

/**
 * Outcomes the front desk records, and what each one does downstream.
 *
 * These are not cosmetic: "Attended" is the only thing that turns a BOOKED
 * contact into a PATIENT, and the two negative outcomes put them back to LEAD
 * so nurture picks them up again. The captions say so, because someone
 * clicking these should know they are moving the person, not just the row.
 */
const OUTCOMES = [
  {
    status: "confirmed",
    label: "Confirmed",
    icon: CalendarClock,
    tone: "text-green-700 hover:border-green-300",
    caption: "They confirmed they're coming",
  },
  {
    status: "completed",
    label: "Attended",
    icon: CheckCircle2,
    tone: "text-green-700 hover:border-green-300",
    caption: "Makes them a Patient",
  },
  {
    status: "no_show",
    label: "Did not turn up",
    icon: UserX,
    tone: "text-amber-700 hover:border-amber-300",
    caption: "Back to Lead, nurture resumes",
  },
  {
    status: "cancelled",
    label: "Cancelled",
    icon: XCircle,
    tone: "text-red-600 hover:border-red-300",
    caption: "Back to Lead, nurture resumes",
  },
]

/** Local wall-clock value for a datetime-local input, never UTC. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<{ appointment: AppointmentDetail; notes: VisitNote[] } | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moved, setMoved] = useState<string | null>(null)
  const [reschedule, setReschedule] = useState("")

  const load = useCallback(async () => {
    const res = await fetch(`/api/appointments/${id}`)
    const d = await res.json().catch(() => null)
    setData(d?.appointment ? d : null)
    if (d?.appointment) setReschedule(toLocalInputValue(d.appointment.scheduledAt))
  }, [id])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const patch = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setError(null)
    setMoved(null)
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok) {
        setError(result?.error ?? "Could not update this appointment")
        toast.error(result?.error ?? "Could not update this appointment")
        return
      }
      toast.success(
        key === "reschedule"
          ? "Appointment rescheduled"
          : `Marked ${OUTCOMES.find((o) => o.status === key)?.label.toLowerCase() ?? "updated"}`,
      )
      if (result?.stageChangedTo) setMoved(result.stageChangedTo)
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const a = data.appointment
  const typeLabel = APPOINTMENT_TYPES.find((t) => t.value === a.type)?.label ?? a.type
  const channelLabel = CHANNELS.find((c) => c.value === a.channel)?.label ?? a.channel

  return (
    <div className="space-y-4">

      <PageHeader
        title={new Date(a.scheduledAt).toLocaleString([], {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      >
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                STATUS_STYLE[a.status] ?? "bg-muted/5 text-muted-foreground"
              }`}
            >
              {a.status}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{typeLabel}</span>
            <span className="flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
              {a.doctorName ?? "No doctor assigned"}
            </span>
            {a.channel && (
              <span className="flex items-center gap-1.5">
                {a.channel === "virtual" ? (
                  <Video className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {channelLabel}
              </span>
            )}
            {a.contactPhone && (
              <a
                href={`tel:+${a.contactPhone}`}
                className="flex items-center gap-1.5 font-medium text-foreground hover:underline"
              >
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                {a.contactPhone}
              </a>
            )}
          </div>
      </PageHeader>

      {moved && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {a.contactName ?? "This contact"} moved to <strong>{moved}</strong>.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-md border border-border p-4">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Outcome
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Recording attendance is what moves the person&apos;s stage — it is the only place the
              system learns whether a booking became a visit.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {OUTCOMES.filter((o) => o.status !== a.status).map((o) => (
                <Button
                  key={o.status}
                  onClick={() => patch(o.status, { status: o.status })}
                  disabled={busy !== null} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left">
                  {busy === o.status ? (
                    <PredictSpinner className="size-4" />
                  ) : (
                    <o.icon className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>
                    <span className="block text-sm font-medium">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.caption}</span>
                  </span>
                </Button>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Reschedule
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={reschedule}
                onChange={(e) => setReschedule(e.target.value)}
                className="rounded-md border border-border px-2.5 py-2 text-sm focus:border-ring focus:outline-none"
              />
              <Button
                onClick={() => patch("reschedule", { scheduledAt: reschedule })}
                disabled={busy !== null || !reschedule || reschedule === toLocalInputValue(a.scheduledAt)} variant="outline">
                {busy === "reschedule" ? (
                  <PredictSpinner className="size-4" />
                ) : (
                  <CalendarClock className="h-4 w-4" />
                )}
                Move appointment
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Moving a visit leaves its status alone — set the outcome separately once it happens.
            </p>
          </section>

          <section className="rounded-md border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Visit notes
            </h2>
            {data.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No notes yet. These are written by the care team in the clinical app.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.notes.map((n) => (
                  <li key={n.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap">{n.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.authorName ?? n.authorRole} · {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-md border border-border p-4">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Documents</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              PDFs, reports, X-rays and photos. The same files show on this person&apos;s lead or patient record.
            </p>
            <DocumentsPanel url={`/api/contacts/${a.contactId}/documents`} appointmentId={a.id} />
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-md border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Details
            </h2>
            <dl className="space-y-2 text-sm">
              {[
                ["Person", a.contactName ?? a.contactPhone ?? "—"],
                ["Stage", a.contactStage ?? "—"],
                ["Booking note", a.notes ?? "—"],
                ["Location", a.meetingLocation ?? "—"],
                ["Created", new Date(a.createdAt).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
