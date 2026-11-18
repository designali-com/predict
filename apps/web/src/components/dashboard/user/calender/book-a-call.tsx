"use client"

import { useEffect, useState } from "react"
import { PredictSpinner } from "@/src/components/predict-loader"
import { Calendar } from "@workspace/ui/components/calendar"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  CalendarDays,
  Clock,
  Video,
  Plus,
  Building2,
  CheckCircle2,
  ArrowLeft,
  XCircle,
  AlertCircle,
  Ban,
  FileText,
  NotebookText,
  } from "lucide-react"

type AppointmentStatus =
  "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show"
type Channel = "virtual" | "in_clinic"

interface Appointment {
  id: string
  type: string
  channel: Channel | null
  status: AppointmentStatus
  scheduledAt: string
  meetingLocation: string | null
  notes: string | null
  doctorName: string | null
  createdAt: string
}

interface AppointmentReport {
  id: string
  fileUrl: string
  fileName: string | null
  reportType: string | null
  uploadedAt: string
}

interface AppointmentNote {
  id: string
  content: string
  authorRole: string
  createdAt: string
}

interface AppointmentDetail {
  appointment: Appointment
  reports: AppointmentReport[]
  notes: AppointmentNote[]
}

type Step = "date" | "time" | "type" | "confirm" | "success"

export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Booking Flow State
  const [step, setStep] = useState<Step>("date")
  const [date, setDate] = useState<Date | undefined>()
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | undefined>()
  const [channel, setChannel] = useState<Channel | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookedAppointment, setBookedAppointment] =
    useState<Appointment | null>(null)

  // Detail view state
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AppointmentDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const openDetail = (id: string) => {
    setDetailId(id)
    setDetail(null)
    setLoadingDetail(true)
    fetch(`/api/patient/appointments/${id}`)
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .catch(() => {})
      .finally(() => setLoadingDetail(false))
  }

  // A failed load used to be swallowed, and the page then said "no
  // appointments" — to somebody who might well have one tomorrow.
  const [listError, setListError] = useState<string | null>(null)

  const loadAppointments = () => {
    setLoadingList(true)
    setListError(null)
    fetch("/api/patient/appointments")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error ?? "Could not load your appointments.")
        setAppointments(data.appointments ?? [])
      })
      .catch((err) => setListError(err instanceof Error ? err.message : "Could not load your appointments."))
      .finally(() => setLoadingList(false))
  }

  useEffect(() => {
    loadAppointments()
  }, [])

  useEffect(() => {
    if (!date || step !== "time") return
    const isoDate = toIsoDate(date)
    setLoadingSlots(true)
    setSlots([])
    setError(null)
    // An error from the booking service is shown as one, not as "no times
    // free on this day", which sent people hunting through empty dates.
    fetch(`/api/patient/appointments/slots?date=${isoDate}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error ?? "Unable to load available times. Please try again.")
        setSlots(data.slots ?? [])
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unable to load available times. Please try again.")
      )
      .finally(() => setLoadingSlots(false))
  }, [date, step])

  // Which days of the month on screen can be booked at all, from the doctors'
  // own hours, leave and bookings. Null until known — nothing is pickable
  // before then, so nobody picks a day that turns out to be closed.
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfToday())
  const [openDays, setOpenDays] = useState<Set<string> | null>(null)
  const [loadingDays, setLoadingDays] = useState(false)
  const [daysError, setDaysError] = useState<string | null>(null)
  // Where an in-clinic visit happens, for the confirm step.
  const [clinicAddress, setClinicAddress] = useState<string | null>(null)

  useEffect(() => {
    if (!isDialogOpen) return
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
    const last = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
    const today = startOfToday()
    if (last < today) {
      setOpenDays(new Set())
      return
    }
    const from = first < today ? today : first
    let live = true
    setLoadingDays(true)
    setDaysError(null)
    setOpenDays(null)
    fetch(`/api/patient/appointments/days?from=${toIsoDate(from)}&to=${toIsoDate(last)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error ?? "Unable to load available days.")
        if (live) {
          setOpenDays(new Set<string>(data.dates ?? []))
          if (data.clinicAddress) setClinicAddress(data.clinicAddress)
        }
      })
      .catch((err) => live && setDaysError(err instanceof Error ? err.message : "Unable to load available days."))
      .finally(() => live && setLoadingDays(false))
    return () => {
      live = false
    }
  }, [isDialogOpen, viewMonth])

  const resetBookingFlow = () => {
    setStep("date")
    setDate(undefined)
    setSlots([])
    setSelectedSlot(undefined)
    setChannel(undefined)
    setError(null)
    setBookedAppointment(null)
    setViewMonth(startOfToday())
  }

  const handleConfirm = async () => {
    if (!selectedSlot || !channel || !date) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/patient/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: toIsoDate(date),
          startIso: selectedSlot,
          channel,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to book appointment. Please try again.")
        return
      }

      setBookedAppointment(data.appointment)
      setStep("success")
      loadAppointments()
    } catch {
      setError("Failed to book appointment. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const todayStart = startOfToday()
  const upcoming = appointments.filter(
    (a) =>
      (a.status === "scheduled" || a.status === "confirmed") &&
      new Date(a.scheduledAt) >= todayStart
  )
  const past = appointments.filter(
    (a) =>
      a.status === "completed" ||
      a.status === "cancelled" ||
      a.status === "no_show" ||
      new Date(a.scheduledAt) < todayStart
  )

  return (
    <div className="mx-auto w-full space-y-4 p-4 sm:p-6">
      {/* HEADER SECTION */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between md:mb-6">
        <div className="max-w-3xl">
          <h1 className="text-xl font-medium tracking-tight md:text-2xl">
            Appointments
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Manage your schedule, past visits, and upcoming consultation calls.
          </p>
        </div>

        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open)
            if (!open) resetBookingFlow()
          }}
        >
          <DialogTrigger
            render={
              <Button nativeButton className="gap-2">
                <Plus className="size-4" />
                Create Appointment
              </Button>
            }
          />

          {/* Was min-w-xl — 576px, wider than any phone, so the dialog ran
              off both sides. Now the screen's width less a margin, up to xl. */}
          <DialogContent className="max-h-[90svh] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto p-0 sm:max-w-xl">
            <DialogHeader className="p-5 pb-2 sm:p-6 sm:pb-2">
              <DialogTitle>Book a Consultation</DialogTitle>
            </DialogHeader>

            <div className="p-5 pt-0 sm:p-6 sm:pt-0">
              {/* STEP 1: DATE */}
              {step === "date" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Clock className="size-3.5" /> 30 mins consultation
                  </div>
                  {/* Only days a doctor actually has a free time on can be
                      picked: Sunday is the clinic's day off and shows red, and a
                      day a doctor has marked off, or that is fully booked, is
                      greyed out rather than offered and then found empty. */}
                  <Calendar
                    mode="single"
                    selected={date}
                    month={viewMonth}
                    onMonthChange={setViewMonth}
                    onSelect={(d) => {
                      setDate(d)
                      setSelectedSlot(undefined)
                      if (d) setStep("time")
                    }}
                    disabled={(day) =>
                      day < startOfToday() ||
                      day.getDay() === 0 ||
                      !openDays ||
                      !openDays.has(toIsoDate(day))
                    }
                    modifiers={{ sunday: { dayOfWeek: [0] } }}
                    modifiersClassNames={{
                      // Clearly red even though disabled, which would otherwise fade it to grey.
                      sunday: "text-red-500 [&_button]:text-red-500 [&_button]:!opacity-80",
                    }}
                    className="mx-auto rounded-md border"
                  />
                  <p className="text-center text-[11px] text-muted-foreground">
                    {loadingDays ? (
                      "Checking which days have free times…"
                    ) : daysError ? (
                      <span className="text-destructive">{daysError}</span>
                    ) : (
                      <>
                        <span className="text-red-500">Sundays closed</span> · greyed-out days have no free
                        times
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* STEP 2: TIME */}
              {step === "time" && (
                <div className="space-y-4">
                  <BackButton onClick={() => setStep("date")} />

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">
                      Available Slots (IST)
                    </p>
                    <p className="text-sm font-medium">
                      {date ? formatDate(date) : ""}
                    </p>

                    {error && !loadingSlots ? (
                      <p className="mt-6 flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {error}
                      </p>
                    ) : loadingSlots ? (
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Skeleton key={i} className="h-9 w-full" />
                        ))}
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="mt-8 flex flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                        <CalendarDays className="mb-2 size-6" />
                        No available times on this date — try another date.
                      </div>
                    ) : (
                      <div className="mt-4 grid max-h-[40vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                        {slots.map((slot) => (
                          <Button
 key={slot}
 type="button"
 variant={
 selectedSlot === slot ? "default" : "outline"
 }
 size="sm"
 onClick={() => setSelectedSlot(slot)}
 >
                            {formatTime(slot)}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button
 disabled={!selectedSlot}
 onClick={() => setStep("type")}
 className="w-full"
 >
                    Next
                  </Button>
                </div>
              )}

              {/* STEP 3: TYPE */}
              {step === "type" && (
                <div className="space-y-4">
                  <BackButton onClick={() => setStep("time")} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button variant="ghost" size="default"
 type="button"
 onClick={() => setChannel("virtual")}
 className={`h-auto whitespace-normal justify-start text-left border p-4 text-left transition-colors ${
 channel === "virtual"
 ? "border-primary bg-primary/5"
 : "hover:bg-muted"
 }`}
 >
                      <Video className="mb-2 size-5" />
                      <p className="text-sm font-semibold">Virtual</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        You&apos;ll receive a Google Meet link.
                      </p>
                    </Button>

                    <Button variant="ghost" size="default"
 type="button"
 onClick={() => setChannel("in_clinic")}
 className={`h-auto whitespace-normal justify-start text-left border p-4 text-left transition-colors ${
 channel === "in_clinic"
 ? "border-primary bg-primary/5"
 : "hover:bg-muted"
 }`}
 >
                      <Building2 className="mb-2 size-5" />
                      <p className="text-sm font-semibold">In-Clinic</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Visit us at our clinic.
                      </p>
                    </Button>
                  </div>

                  <Button
 disabled={!channel}
 onClick={() => setStep("confirm")}
 className="w-full"
 >
                    Next
                  </Button>
                </div>
              )}

              {/* STEP 4: CONFIRM */}
              {step === "confirm" && (
                <div className="space-y-4">
                  <BackButton onClick={() => setStep("type")} />

                  <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
                    <p>
                      <span className="font-semibold">
                        {date ? formatDate(date) : ""}
                      </span>{" "}
                      at{" "}
                      <span className="font-semibold">
                        {selectedSlot ? formatTime(selectedSlot) : ""}
                      </span>
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {channel === "virtual" ? <Video className="size-3.5" /> : <Building2 className="size-3.5" />}
                      {channel === "virtual" ? "Virtual — Google Meet" : "In-Clinic"}
                    </p>
                    {channel === "in_clinic" && clinicAddress && (
                      <p className="text-xs leading-relaxed">
                        <span className="text-muted-foreground">Address: </span>
                        <span className="font-medium">{clinicAddress}</span>
                      </p>
                    )}
                  </div>

                  {error && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle className="size-3.5" /> {error}
                    </p>
                  )}

                  <Button
 onClick={handleConfirm}
 disabled={submitting}
 className="w-full"
 >
                    {submitting ? "Booking..." : "Confirm Appointment"}
                  </Button>
                </div>
              )}

              {/* STEP 5: SUCCESS */}
              {step === "success" && (
                <div className="py-6 text-center">
                  <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
                  <h3 className="mt-3 text-lg font-semibold">
                    Appointment Booked!
                  </h3>

                  {bookedAppointment?.channel === "virtual" &&
                  bookedAppointment.meetingLocation ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Join with Google Meet:{" "}
                      <a
                        href={bookedAppointment.meetingLocation}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline"
                      >
                        {bookedAppointment.meetingLocation}
                      </a>
                    </p>
                  ) : bookedAppointment?.meetingLocation ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Location:{" "}
                      <span className="font-medium">
                        {bookedAppointment.meetingLocation}
                      </span>
                    </p>
                  ) : null}

                  <Button
 onClick={() => {
 setIsDialogOpen(false)
 resetBookingFlow()
 }}
 className="mt-6"
 >
                    Close
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {listError ? (
        <Card className="border-destructive/30 shadow-none">
          <CardContent className="flex flex-col items-start gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-4 shrink-0" /> {listError}
            </p>
            <Button size="sm" variant="outline" onClick={loadAppointments}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* DASHBOARD LIST TABS */}
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:max-w-xs">
              <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
              <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-3">
              <AppointmentList
                items={upcoming}
                loading={loadingList}
                emptyMessage="No upcoming appointments scheduled."
                onOpenDetail={openDetail}
              />
            </TabsContent>

            <TabsContent value="past" className="mt-3">
              <AppointmentList
                items={past}
                loading={loadingList}
                emptyMessage="No past appointment history found."
                onOpenDetail={openDetail}
              />
            </TabsContent>

            <TabsContent value="all" className="mt-3">
              <AppointmentList
                items={appointments}
                loading={loadingList}
                emptyMessage="No appointments available."
                onOpenDetail={openDetail}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog
        open={detailId !== null}
        onOpenChange={(open) => !open && setDetailId(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <PredictSpinner className="size-6" />
            </div>
          ) : detail ? (
            <div className="space-y-4 text-sm">
              <div className="space-y-2 rounded-lg bg-muted/50 p-4">
                <div className="flex items-center gap-2">
                  <StatusBadge status={detail.appointment.status} />
                  {detail.appointment.channel && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {detail.appointment.channel === "virtual" ? (
                        <Video className="size-3" />
                      ) : (
                        <Building2 className="size-3" />
                      )}
                      {detail.appointment.channel === "virtual"
                        ? "Virtual"
                        : "In-Clinic"}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold capitalize">
                  {typeLabel(detail.appointment.type)}
                </h3>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  {formatDate(new Date(detail.appointment.scheduledAt))} at{" "}
                  {formatTime(detail.appointment.scheduledAt)}
                </p>
                {detail.appointment.meetingLocation && (
                  <p className="text-xs text-muted-foreground">
                    {detail.appointment.channel === "virtual" ? (
                      <>
                        Join:{" "}
                        <a
                          href={detail.appointment.meetingLocation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary underline"
                        >
                          {detail.appointment.meetingLocation}
                        </a>
                      </>
                    ) : (
                      <>
                        Location:{" "}
                        <span className="font-medium">
                          {detail.appointment.meetingLocation}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>

              {/* Reports and notes appear only once there are some — an
                  empty heading with "none yet" under it tells the patient
                  nothing and reads as something missing. */}
              {detail.reports.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  <FileText className="size-3.5" /> Reports
                </p>
                  <div className="space-y-1.5">
                    {detail.reports.map((r) => (
                      <a
                        key={r.id}
                        href={r.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-xs hover:bg-muted"
                      >
                        <span className="font-medium">
                          {r.reportType === "initial"
                            ? "Initial Report"
                            : r.reportType === "final"
                              ? "Final Report"
                              : r.fileName || "Report"}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDate(new Date(r.uploadedAt))}
                        </span>
                      </a>
                    ))}
                  </div>
              </div>
              )}

              {detail.notes.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  <NotebookText className="size-3.5" /> Notes
                </p>
                  <div className="space-y-2">
                    {detail.notes.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-md border p-2.5 text-xs"
                      >
                        <div className="mb-1 flex items-center justify-between text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {typeLabel(n.authorRole)}
                          </span>
                          <span>{formatDate(new Date(n.createdAt))}</span>
                        </div>
                        <p>{n.content}</p>
                      </div>
                    ))}
                  </div>
              </div>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Unable to load appointment details.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="default"
 type="button"
 onClick={onClick}
 className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
 >
      <ArrowLeft className="size-3" /> Back
    </Button>
  )
}

/**
 * The calendar day the patient picked, as YYYY-MM-DD.
 *
 * From the local date, not toISOString(): the calendar hands back local
 * midnight, which in India is 18:30 the day before in UTC — so picking the
 * 25th asked the server for the 24th's slots and booked the wrong day.
 */
function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** "follow_up_visit" → "Follow up visit". */
function typeLabel(type: string): string {
  const text = type.replace(/_/g, " ").trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "Prashun" → "Dr. Prashun"; a name already carrying the title is left alone. */
function doctorLabel(name: string): string {
  return /^dr\.?\s/i.test(name.trim()) ? name.trim() : `Dr. ${name.trim()}`
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Calcutta",
  })
}

function AppointmentList({
  items,
  loading,
  emptyMessage,
  onOpenDetail,
}: {
  items: Appointment[]
  loading: boolean
  emptyMessage: string
  onOpenDetail: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="grid gap-1.5">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="flex min-h-[120px] flex-col items-center justify-center gap-3 text-center text-xs text-muted-foreground">
          <CalendarDays className="size-6" />
          {emptyMessage}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-1.5">
      {items.map((item) => {
        const scheduledDate = new Date(item.scheduledAt)
        return (
          <Card
            key={item.id}
            className="cursor-pointer border shadow-none transition-colors hover:bg-muted/40"
            onClick={() => onOpenDetail(item.id)}
          >
            <CardContent className="flex flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.status} />
                  {item.channel && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {item.channel === "virtual" ? (
                        <Video className="size-3" />
                      ) : (
                        <Building2 className="size-3" />
                      )}
                      {item.channel === "virtual" ? "Virtual" : "In-Clinic"}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold capitalize">
                    {typeLabel(item.type)}
                  </h3>
                  {item.doctorName && (
                    <p className="text-xs text-muted-foreground">
                      {doctorLabel(item.doctorName)}
                    </p>
                  )}
                </div>
              </div>

              <Separator className="sm:hidden" />

              <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
                <div className="text-left sm:text-right">
                  <p className="flex items-center gap-1 text-xs font-semibold sm:justify-end">
                    <CalendarDays className="size-3 text-muted-foreground" />
                    {formatDate(scheduledDate)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground sm:justify-end">
                    <Clock className="size-3" />
                    {formatTime(item.scheduledAt)}
                  </p>
                </div>

                {item.channel === "virtual" &&
                  item.meetingLocation &&
                  (item.status === "scheduled" ||
                    item.status === "confirmed") && (
                    <Button
 size="sm"
 variant="outline"
 className="h-8 text-xs"
 onClick={(e) => e.stopPropagation()}
 render={
 <a
 href={item.meetingLocation}
 target="_blank"
 rel="noopener noreferrer"
 onClick={(e) => e.stopPropagation()}
 >
 <Video className="mr-1.5 size-3" /> Join Call
 </a>
 }
 />
                  )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const config: Record<
    AppointmentStatus,
    { className: string; icon: typeof Clock; label: string }
  > = {
    scheduled: {
      className:
        "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
      icon: Clock,
      label: "Scheduled",
    },
    confirmed: {
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      icon: CheckCircle2,
      label: "Confirmed",
    },
    completed: {
      className: "border-muted-foreground/30 bg-muted text-muted-foreground",
      icon: CheckCircle2,
      label: "Completed",
    },
    cancelled: {
      className: "border-destructive/30 bg-destructive/10 text-destructive",
      icon: XCircle,
      label: "Cancelled",
    },
    no_show: {
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      icon: Ban,
      label: "No-show",
    },
  }

  const { className, icon: Icon, label } = config[status]

  return (
    <Badge variant="outline" className={className}>
      <Icon className="mr-1 size-3" /> {label}
    </Badge>
  )
}
