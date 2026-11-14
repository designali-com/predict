"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"
import { addDays, dayLabel, hourLabel, SlotGrid, useSlotWeek } from "./slot-grid"

/**
 * Book a therapy hour for one patient, with a therapist. The week is shown with
 * the places left in each hour; picking an hour lists the therapists still free
 * in it, so two patients are never put with the same therapist at once.
 */
export function BookSlotDialog({
  contactId,
  enrollmentId,
  patientName,
  onClose,
  onBooked,
}: {
  contactId: string
  enrollmentId?: string | null
  patientName: string | null
  onClose: () => void
  onBooked: () => void
}) {
  const [from, setFrom] = useState<string | null>(null)
  const { data, loading, reload } = useSlotWeek(from)
  const [picked, setPicked] = useState<{ day: string; hour: number } | null>(null)
  const [note, setNote] = useState("")
  const [therapistId, setTherapistId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = from ?? data?.from ?? null
  const cell = picked ? data?.columns.find((c) => c.day === picked.day)?.slots.find((s) => s.hour === picked.hour) : null
  const therapists = data?.therapists ?? []
  const busyHere = new Set(cell?.busyTherapistIds ?? [])
  const freeTherapists = therapists.filter((x) => !busyHere.has(x.id))

  async function book() {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/staff/therapy-calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "book", contactId, enrollmentId: enrollmentId ?? null, day: picked.day, hour: picked.hour, therapistId: therapistId || null, note }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error ?? "Could not book that hour")
        await reload()
        return
      }
      const who = therapists.find((x) => x.id === therapistId)?.name
      toast.success(`Booked ${dayLabel(picked.day)}, ${hourLabel(picked.hour)}${who ? ` with ${who}` : ""}`)
      onBooked()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-md border border-border bg-background p-4 shadow-lg">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Book a therapy hour</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{patientName ?? "Patient"} · pick an hour with a place free</p>
          </div>
          <Button variant="ghost" size="default" className="text-muted-foreground hover:text-foreground" type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={!start} onClick={() => start && setFrom(addDays(start, -7))} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFrom(null)}>
            This week
          </Button>
          <Button size="sm" variant="outline" disabled={!start} onClick={() => start && setFrom(addDays(start, 7))} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {data && <span className="ml-1 text-xs text-muted-foreground">{data.settings.capacity} per hour</span>}
        </div>

        {loading || !data ? (
          <div className="flex justify-center py-10">
            <PredictSpinner className="size-5" />
          </div>
        ) : (
          <SlotGrid
            columns={data.columns}
            capacity={data.settings.capacity}
            selected={picked}
            onPick={(day, hour) => {
              setPicked({ day, hour })
              // A therapist free at one hour may not be at the next.
              setTherapistId("")
            }}
          />
        )}

        {/* Who will treat them — only the therapists still free in that hour. */}
        {picked && therapists.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Therapist</p>
            <div className="flex flex-wrap gap-2">
              {therapists.map((x) => {
                const taken = busyHere.has(x.id)
                const on = therapistId === x.id
                return (
                  <button
                    key={x.id}
                    type="button"
                    disabled={taken}
                    onClick={() => setTherapistId(on ? "" : x.id)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : taken
                          ? "cursor-not-allowed border-dashed text-muted-foreground line-through opacity-60"
                          : "hover:border-primary"
                    }`}
                  >
                    {x.name}
                    {x.gender && <span className="ml-1 text-[11px] opacity-70">{x.gender === "female" ? "F" : "M"}</span>}
                    {taken && <span className="ml-1 text-[11px]">· booked</span>}
                  </button>
                )
              })}
            </div>
            {!therapistId && freeTherapists.length > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">None picked — the first free therapist ({freeTherapists[0]!.name}) is given.</p>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">
            {picked ? (
              <>
                <b>{dayLabel(picked.day)}</b>, {hourLabel(picked.hour)}
                {cell && <span className="text-muted-foreground"> · {cell.free} free</span>}
              </>
            ) : (
              <span className="text-muted-foreground">Click an hour in the grid.</span>
            )}
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="ml-auto h-8 w-48 rounded-md border border-black/18 bg-white px-2 text-sm dark:border-white/10 dark:bg-black"
          />
          <Button onClick={book} disabled={!picked || busy || cell?.free === 0}>
            {busy ? "Booking…" : "Book"}
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}
