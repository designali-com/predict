"use client"

import { useCallback, useEffect, useState } from "react"
import { Library, Printer, Salad } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { DietProtocolSummary, DietProtocolView } from "@workspace/ui/components/diet-protocol-view"
import { dietLabel, emptyProtocol, weightLossTemplate, type DietProtocol } from "@workspace/db/diet-protocol"
import { PredictSpinner } from "@/src/components/predict-loader"
import { DietProtocolForm } from "./diet-protocol-form"
import { DietProtocolPicker } from "./diet-protocol-picker"
import { RecordSection } from "./record-ui"

interface Stored {
  protocol: DietProtocol
  updatedAt: string
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
}

/**
 * The patient's dietary protocol — written by the nutritionist after the
 * consult above it, read back as the patient will see it, and edited only on
 * Edit so the tab stays a page of reading rather than a page of boxes.
 *
 * Draws its own "Diet protocol" section, with its buttons on the title row.
 */
export function DietProtocolEditor({ contactId }: { contactId: string }) {
  const [stored, setStored] = useState<Stored | null | undefined>(undefined)
  const [draft, setDraft] = useState<DietProtocol | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const wrap = (body: React.ReactNode, action?: React.ReactNode) => (
    <RecordSection title="Diet protocol" icon={Salad} action={action}>
      {body}
    </RecordSection>
  )

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/patients/${contactId}/protocol`)
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error ?? "Could not load the protocol.")
      setStored(null)
      return
    }
    setStored(data as Stored | null)
  }, [contactId])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!draft) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/staff/patients/${contactId}/protocol`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
    const data = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      setError(data?.error ?? "Could not save the protocol.")
      toast.error(data?.error ?? "Could not save the protocol.")
      return
    }
    setStored(data as Stored)
    setDraft(null)
    toast.success("Diet protocol saved — the patient sees it on their dashboard")
  }

  if (stored === undefined) {
    return wrap(
      <div className="flex justify-center py-8">
        <PredictSpinner className="size-5" />
      </div>,
    )
  }

  const picker = (
    <DietProtocolPicker
      open={picking}
      onOpenChange={setPicking}
      preferDiet={stored?.protocol.diet ?? null}
      onPick={(copy) => {
        setError(null)
        setDraft(copy)
      }}
      onStart={(which) => {
        setError(null)
        setDraft(which === "weight_loss" ? weightLossTemplate() : emptyProtocol())
      }}
    />
  )

  // ---------------------------------------------------------------- reading
  if (!draft) {
    if (!stored) {
      // Nothing yet: one button on the title row. The choice — a library
      // protocol, the Weight Loss template, or a blank sheet — is in the popup.
      return wrap(
        error ? <p className="text-sm text-red-600">{error}</p> : null,
        <>
          <Button size="sm" onClick={() => setPicking(true)}>
            <Library /> Assign
          </Button>
          {picker}
        </>,
      )
    }
    const source = stored.protocol.source
    return wrap(
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {dietLabel(stored.protocol.diet) && <b className="text-foreground">{dietLabel(stored.protocol.diet)} · </b>}
            {stored.protocol.updated ? `Saved by ${stored.protocol.updated.byName} · ${when(stored.protocol.updated.at)}` : `Saved ${when(stored.updatedAt)}`}
            {source && ` · from "${source.templateName}"`}
            {" · on the patient's dashboard"}
          </p>
        </div>
        <DietProtocolSummary protocol={stored.protocol} />
        <DietProtocolView protocol={stored.protocol} />
        {picker}
      </div>,
      <>
        <Button size="sm" variant="outline" onClick={() => window.open(`/diet-protocol/${contactId}?print=1`, "_blank")}>
          <Printer /> Print
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
          <Library /> Replace
        </Button>
        <Button size="sm" onClick={() => setDraft(structuredClone(stored.protocol))}>
          Edit
        </Button>
      </>,
    )
  }

  // ---------------------------------------------------------------- editing
  return wrap(
    <div className="flex flex-col gap-5">
      {draft.source && (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Copied from the library protocol <b className="text-foreground">{draft.source.templateName}</b> — change
          what this patient needs; the library stays as it is.
        </p>
      )}
      <DietProtocolForm value={draft} onChange={setDraft} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button onClick={save} disabled={busy || !draft.title.trim()}>
          {busy && <PredictSpinner className="size-4" />}
          Save protocol
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
        {!stored && (
          <Button variant="ghost" className="ml-auto" disabled={busy} onClick={() => setDraft(weightLossTemplate())}>
            Reset to Weight Loss template
          </Button>
        )}
      </div>
    </div>,
  )
}

