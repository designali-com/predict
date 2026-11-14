"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Bell, BellOff, CircleCheck, Dumbbell, Library, Link2, Printer, Search, Send, Sparkles } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { ExerciseProtocolView } from "@workspace/ui/components/exercise-protocol-view"

import { combineProtocols, emptyExerciseProtocol, kneeTemplate, type ExerciseProtocol } from "@workspace/db/exercise-protocol"
import { PredictSpinner } from "@/src/components/predict-loader"
import { ExerciseProtocolForm } from "./exercise-protocol-form"
import { CheckinLog } from "./checkin-log"
import { RecordSection } from "./record-ui"

interface Stored {
  protocol: ExerciseProtocol
  /** Switched on for the patient; a new prescription is a draft until then. */
  active: boolean
  updatedAt: string
  createdAt: string
}

interface LibraryItem {
  id: string
  name: string
  protocol: ExerciseProtocol
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
}

/**
 * The patient's exercise prescription — written by the doctor (from the
 * patient's record or an appointment), read back as it prints, edited only on
 * Edit. A new one is saved as a draft and reaches the patient only once a
 * doctor presses Activate. The daily WhatsApp check-in is switched here, outside
 * the form, and its answers show under it.
 */
export function ExerciseProtocolEditor({
  contactId,
  onPrescription,
  asSection = false,
}: {
  contactId: string
  /** Draw its own "Exercise" section, with its buttons on the section's title row. */
  asSection?: boolean
  /** Told about the saved prescription whenever it loads or changes. */
  onPrescription?: (protocol: ExerciseProtocol | null) => void
}) {
  const [stored, setStored] = useState<Stored | null | undefined>(undefined)

  useEffect(() => {
    if (stored !== undefined) onPrescription?.(stored?.protocol ?? null)
  }, [stored, onPrescription])
  const [draft, setDraft] = useState<ExerciseProtocol | null>(null)
  const [busy, setBusy] = useState(false)
  // Which step is running — its button alone shows the spinner; the others only wait.
  const [working, setWorking] = useState<"activate" | "send" | "checkin" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  // Auto-prescribe: writing one from the record, and why it chose what it did.
  const [generating, setGenerating] = useState(false)
  const [reasoning, setReasoning] = useState<string | null>(null)
  const [planUrl, setPlanUrl] = useState<string | null>(null)
  const wrap = (body: React.ReactNode, action?: React.ReactNode) =>
    asSection ? (
      <RecordSection title="Exercise" icon={Dumbbell} action={action}>
        {body}
      </RecordSection>
    ) : (
      <>
        {action && <div className="mb-3 flex flex-wrap justify-end gap-2">{action}</div>}
        {body}
      </>
    )

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/patients/${contactId}/exercise`)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error ?? "Could not load the prescription.")
      setStored(null)
      return
    }
    setStored(data?.prescription ?? null)
    setPlanUrl(data?.planUrl ?? null)
  }, [contactId])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!draft) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/staff/patients/${contactId}/exercise`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      setError(data?.error ?? "Could not save the prescription.")
      toast.error(data?.error ?? "Could not save the prescription.")
      return
    }
    setStored(data as Stored)
    setDraft(null)
    toast.success((data as Stored).active ? "Exercise prescription saved" : "Saved as a draft — press Activate to start it")
  }

  /** Ask AI for a prescription from this patient's record; it opens here to check and save. */
  async function autoPrescribe() {
    setGenerating(true)
    setError(null)
    const res = await fetch(`/api/staff/patients/${contactId}/exercise/auto`, { method: "POST" })
    const data = await res.json().catch(() => null)
    setGenerating(false)
    if (!res.ok) {
      toast.error(data?.error ?? "Could not write the prescription.")
      return
    }
    setReasoning(data.reasoning ?? null)
    setDraft(data.protocol as ExerciseProtocol)
  }

  /**
   * Activate the draft, send it on WhatsApp, or start / stop the daily
   * check-in — three separate steps, each saved at once.
   */
  async function patch(body: { activate: true } | { send: true } | { dailyCheckIn: boolean }) {
    setBusy(true)
    setWorking("activate" in body ? "activate" : "send" in body ? "send" : "checkin")
    setError(null)
    const res = await fetch(`/api/staff/patients/${contactId}/exercise`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    setWorking(null)
    if (!res.ok) {
      toast.error(data?.error ?? "Could not update the prescription.")
      return
    }
    setStored(data as Stored)
    if ("activate" in body) toast.success("Exercise prescription activated — send it and start the check-in when ready")
    if ("dailyCheckIn" in body) toast.success(body.dailyCheckIn ? "Daily check-in started" : "Daily check-in stopped")
    const whatsapp = data?.whatsapp as { sent: boolean; reason?: string } | undefined
    if (whatsapp?.sent) toast.success("Sent to the patient on WhatsApp — the PDF and the plan link")
    else if (whatsapp) toast.warning(`Not sent on WhatsApp: ${whatsapp.reason}`)
  }

  if (stored === undefined) {
    return wrap(
      <div className="flex justify-center py-8">
        <PredictSpinner className="size-5" />
      </div>,
    )
  }

  const picker = (
    <ExercisePicker
      open={picking}
      onOpenChange={setPicking}
      onPick={(copy) => {
        setError(null)
        setDraft(copy)
      }}
      onStart={(which) => {
        setError(null)
        setReasoning(null)
        if (which === "ai") return void autoPrescribe()
        setDraft(which === "knee" ? kneeTemplate() : emptyExerciseProtocol())
      }}
    />
  )

  if (generating) {
    return wrap(
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <PredictSpinner className="size-5" />
        <p className="text-sm font-medium">Writing the prescription…</p>
        <p className="text-xs text-muted-foreground">From the diagnosis, measurements, questionnaires and VALD results.</p>
      </div>,
    )
  }

  // ---------------------------------------------------------------- editing
  if (draft) {
    return wrap(
      <div className="flex flex-col gap-5">
        {draft.source?.templateId === "ai" ? (
          <div className="rounded-md border border-primary/30 bg-primary/[0.04] px-3 py-2 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Auto-prescribed by AI — check every exercise before saving
            </p>
            {reasoning && <p className="mt-1 text-muted-foreground">{reasoning}</p>}
          </div>
        ) : draft.source && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Copied from the library prescription <b className="text-foreground">{draft.source.templateName}</b> — change
            what this patient needs; the library stays as it is.
          </p>
        )}
        <ExerciseProtocolForm value={draft} onChange={setDraft} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button onClick={save} disabled={busy || !draft.title.trim()}>
            {busy && <PredictSpinner className="size-4" />}
            Save prescription
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setDraft(null)
              setError(null)
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- empty
  if (!stored) {
    return (
      // Nothing prescribed: one button on the title row. The choice — a library
      // plan, the knee template, or a blank sheet — is made in the popup.
      wrap(
        error ? <p className="text-sm text-red-600">{error}</p> : null,
        <>
          <Button size="sm" onClick={() => setPicking(true)}>
            <Library /> Prescribe
          </Button>
          {picker}
        </>,
      )
    )
  }

  // ---------------------------------------------------------------- reading
  const p = stored.protocol
  return wrap(
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {p.updated ? `Prescribed by ${p.updated.byName} · ${when(p.updated.at)}` : `Saved ${when(stored.updatedAt)}`}
          {p.source && ` · from "${p.source.templateName}"`}
          {p.activated && ` · activated by ${p.activated.byName}, ${when(p.activated.at)}`}
        </p>
      </div>

      {!stored.active && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <b>Draft</b> — the patient gets nothing yet. Check the exercises, then press Activate. Sending it on WhatsApp
          and starting the daily check-in are separate steps after that.
        </p>
      )}

      {stored.active && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Send on WhatsApp</span>
              <span className="block text-xs text-muted-foreground">
                One message: the prescription PDF and a link to the plan with the videos.
                {p.sentOnWhatsApp ? ` Last sent ${when(p.sentOnWhatsApp.at)} by ${p.sentOnWhatsApp.byName}.` : " Not sent yet."}
              </span>
            </span>
            <Button
              size="sm"
              variant={p.sentOnWhatsApp ? "outline" : "default"}
              disabled={busy}
              className="self-start"
              onClick={() =>
                (!p.sentOnWhatsApp || confirm("This plan was already sent. Send it to the patient on WhatsApp again?")) &&
                patch({ send: true })
              }
            >
              {working === "send" ? <PredictSpinner className="size-4" /> : <Send />} {p.sentOnWhatsApp ? "Send again" : "Send on WhatsApp"}
            </Button>
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Daily WhatsApp check-in</span>
              <span className="block text-xs text-muted-foreground">
                Every morning the patient is asked whether they did yesterday&apos;s exercises; their tap is recorded below.
                {p.dailyCheckIn
                  ? p.checkInStarted
                    ? ` Running since ${when(p.checkInStarted.at)}.`
                    : " Running."
                  : " Not started."}
              </span>
            </span>
            <Button
              size="sm"
              variant={p.dailyCheckIn ? "outline" : "default"}
              disabled={busy}
              className="self-start"
              onClick={() =>
                p.dailyCheckIn
                  ? confirm("Stop the daily check-in for this patient?") && patch({ dailyCheckIn: false })
                  : patch({ dailyCheckIn: true })
              }
            >
              {working === "checkin" ? <PredictSpinner className="size-4" /> : p.dailyCheckIn ? <BellOff /> : <Bell />}{" "}
              {p.dailyCheckIn ? "Stop daily check-in" : "Start daily check-in"}
            </Button>
          </div>
        </div>
      )}

      {stored.active && p.dailyCheckIn && <CheckinLog contactId={contactId} kinds={["exercise"]} />}
      <ExerciseProtocolView protocol={p} />
      {picker}
    </div>,
    <>
      <Button size="sm" variant="outline" onClick={() => window.open(`/exercise-protocol/${contactId}?print=1`, "_blank")}>
        <Printer /> Print
      </Button>
      {stored.active && planUrl && (
        <Button
          size="sm"
          variant="outline"
          title="The patient's own page for this plan, with the videos — opens without a login"
          onClick={() => {
            void navigator.clipboard.writeText(planUrl).then(() => toast.success("Patient link copied"))
            window.open(planUrl, "_blank")
          }}
        >
          <Link2 /> Patient link
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
        <Library /> Replace
      </Button>
      <Button size="sm" variant={stored.active ? "default" : "outline"} onClick={() => setDraft(structuredClone(p))}>
        Edit
      </Button>
      {!stored.active && (
        <Button size="sm" disabled={busy} onClick={() => patch({ activate: true })}>
          {working === "activate" ? <PredictSpinner className="size-4" /> : <CircleCheck />} Activate
        </Button>
      )}
    </>,
  )
}

/**
 * Pick a library prescription; what comes back is a copy to adjust before saving.
 * Pain in more than one place — knee, back and shoulder — is several ticked and
 * combined into one.
 */
function ExercisePicker({
  open,
  onOpenChange,
  onPick,
  onStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (protocol: ExerciseProtocol) => void
  /** The built-in starting points: the knee template, or a blank sheet. */
  onStart?: (which: "ai" | "knee" | "blank") => void
}) {
  const [list, setList] = useState<LibraryItem[] | null>(null)
  const [query, setQuery] = useState("")
  const [ticked, setTicked] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setList(null)
    setTicked([])
    fetch("/api/staff/exercise-protocols")
      .then((r) => (r.ok ? r.json() : { protocols: [] }))
      .then((d) => setList(d.protocols ?? []))
      .catch(() => setList([]))
  }, [open])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.protocol.goal.toLowerCase().includes(q))
  }, [list, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85svh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-3 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Prescribe exercise</DialogTitle>
        </DialogHeader>
        {onStart && (
          <button
            type="button"
            onClick={() => {
              onStart("ai")
              onOpenChange(false)
            }}
            className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/[0.05] px-3 py-2.5 text-left hover:border-primary"
          >
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-semibold">Auto-prescribe with AI</span>
              <span className="block text-xs text-muted-foreground">
                Written for this patient from the diagnosis, measurements, questionnaires and VALD results, for their course length
              </span>
            </span>
          </button>
        )}
        {onStart && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onStart("knee")
                onOpenChange(false)
              }}
              className="rounded-md border border-border px-3 py-2 text-left hover:border-ring"
            >
              <span className="block text-sm font-medium">Knee template</span>
              <span className="block text-xs text-muted-foreground">Built-in starting point</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onStart("blank")
                onOpenChange(false)
              }}
              className="rounded-md border border-border px-3 py-2 text-left hover:border-ring"
            >
              <span className="block text-sm font-medium">Start blank</span>
              <span className="block text-xs text-muted-foreground">Write it from scratch</span>
            </button>
          </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prescriptions"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
          {list === null ? (
            <div className="flex justify-center py-8">
              <PredictSpinner className="size-5" />
            </div>
          ) : shown.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {list.length === 0 ? (
                <>
                  The library is empty.{" "}
                  <Link href="/care-plan-library" className="font-medium text-primary hover:underline">
                    Add one in the Care Plan Library
                  </Link>
                  .
                </>
              ) : (
                "Nothing matches."
              )}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((p) => (
                <li key={p.id} className="flex items-center">
                  <label className="flex cursor-pointer items-center self-stretch pl-3" title="Tick several to combine them">
                    <input
                      type="checkbox"
                      checked={ticked.includes(p.id)}
                      onChange={() => setTicked((t) => (t.includes(p.id) ? t.filter((id) => id !== p.id) : [...t, p.id]))}
                      aria-label={`Combine ${p.name}`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const copy = structuredClone(p.protocol)
                      delete copy.updated
                      copy.source = { templateId: p.id, templateName: p.name }
                      onPick(copy)
                      onOpenChange(false)
                    }}
                    className="flex w-full flex-col items-start px-3 py-2.5 text-left hover:bg-muted/50"
                  >
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.protocol.exercises.length} exercises{p.protocol.duration ? ` · ${p.protocol.duration}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {ticked.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/[0.05] px-3 py-2">
            <span className="text-xs">
              {ticked.length === 1
                ? "Tick one more to combine — knee, back and shoulder pain in one prescription."
                : `Combining ${ticked.length}: ${(list ?? []).filter((p) => ticked.includes(p.id)).map((p) => p.name).join(" + ")}`}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={ticked.length < 2}
              onClick={() => {
                // In the order they were ticked: the first area's exercises come first.
                const parts = ticked
                  .map((id) => (list ?? []).find((p) => p.id === id))
                  .filter((p): p is LibraryItem => Boolean(p))
                  .map((p) => ({ id: p.id, name: p.name, protocol: structuredClone(p.protocol) }))
                onPick(combineProtocols(parts))
                onOpenChange(false)
              }}
            >
              Combine into one
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
