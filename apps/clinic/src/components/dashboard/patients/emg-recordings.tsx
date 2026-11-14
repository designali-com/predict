"use client"

import { useEffect, useState } from "react"
import { Activity, AlertTriangle, ChevronDown, Download, Loader2, Radio, Trash2, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import type { EmgMetrics, PhaseSpan } from "@/src/lib/emg/metrics"
import { EmgEnvelopeChart, EmgMetricsView, type EmgEnvelope, type EmgMarker } from "./emg-result"
import { EmgRunner } from "./emg-runner"
import { RecordEmpty, RecordSection, recordDateTime } from "./record-ui"

interface Recording {
  id: string
  appointmentId: string | null
  protocolName: string
  montage: string | null
  side: string | null
  /** Old recordings: one entry per channel. New ones: one per band, with its channels. */
  placements: ({ channel: number; muscle: string } | { label: string; channels: { ch: number; muscle: string; short?: string }[] })[]
  device: { band?: string | null; battery?: number | null; dynamo?: string | null; recordedBy?: { name?: string } }
  durationSeconds: number
  samplesMissing: number
  markers: (EmgMarker & { phase?: number })[]
  metrics: EmgMetrics & { spans?: PhaseSpan[]; entries?: { id: string; label: string; unit: string; value: string }[] }
  envelope: EmgEnvelope
  force: { t: number[]; newtons: number[] } | null
  rawUrl: string | null
  notes: string | null
  recordedAt: string
}

/**
 * EMG, as its own tab: record with the band (and the DynaMo if wanted), and
 * every recording saved for this patient under it.
 */
export function EmgPanel({ patientId, appointmentId }: { patientId: string | null; appointmentId?: string | null }) {
  const [performing, setPerforming] = useState(false)
  const [version, setVersion] = useState(0)
  const noChart = <RecordEmpty>A chart is created on the first booking. Recordings are filed against it.</RecordEmpty>

  return (
    <div className="flex flex-col gap-4">
      <RecordSection
        title="EMG recording"
        icon={Radio}
        action={
          patientId ? (
            performing ? (
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setPerforming(false)}>
                <X className="h-4 w-4" />
                Close
              </Button>
            ) : (
              <Button size="sm" className="h-8" onClick={() => setPerforming(true)}>
                <Radio className="h-4 w-4" />
                Record EMG
              </Button>
            )
          ) : undefined
        }
      >
        {!patientId ? noChart : performing ? (
          <EmgRunner patientId={patientId} appointmentId={appointmentId} onSaved={() => setVersion((v) => v + 1)} />
        ) : null}
      </RecordSection>

      <RecordSection title="Recordings" icon={Activity}>
        {patientId ? <EmgRecordings key={version} patientId={patientId} appointmentId={appointmentId} /> : noChart}
      </RecordSection>
    </div>
  )
}

/** What each channel recorded, in channel order, for either shape of placements. */
function musclesOf(r: Recording): string[] {
  const p = r.placements ?? []
  const bands = p.filter((x): x is { label: string; channels: { ch: number; muscle: string; short?: string }[] } => "channels" in x)
  if (!bands.length) return p.map((x) => ("muscle" in x ? x.muscle : ""))
  return bands.flatMap((b) => b.channels.map((c) => (bands.length > 1 ? `${b.label} · ${c.short ?? c.muscle}` : c.muscle)))
}

function EmgRecordings({ patientId, appointmentId }: { patientId: string; appointmentId?: string | null }) {
  const [rows, setRows] = useState<Recording[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/staff/patients/${patientId}/emg`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || "Could not load the recordings.")
        return data.recordings as Recording[]
      })
      .then((list) => {
        if (!live) return
        setRows(list)
        setOpen((o) => o ?? list[0]?.id ?? null)
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load the recordings."))
    return () => {
      live = false
    }
  }, [patientId])

  async function remove(id: string) {
    if (!window.confirm("Delete this recording and its signal? This cannot be undone.")) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/staff/patients/${patientId}/emg?recordingId=${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not delete it.")
      setRows((r) => r?.filter((x) => x.id !== id) ?? null)
      toast.success("Recording deleted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete it.")
    } finally {
      setDeleting(null)
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!rows) return <Loader2 className="size-4 animate-spin text-black/55" />
  if (!rows.length) return <RecordEmpty>No EMG recorded yet.</RecordEmpty>

  return (
    <ul className="flex flex-col divide-y divide-black/[0.12] dark:divide-white/[0.12]">
      {rows.map((r) => {
        const isOpen = open === r.id
        const flags = r.metrics?.quality?.flags?.length ?? 0
        const spans = r.metrics?.spans ?? r.metrics?.phases ?? []
        return (
          <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
            <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} className="flex w-full items-center gap-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                  {r.protocolName}
                  {r.montage && <span className="text-xs font-normal text-black/60 dark:text-white/55">{r.montage}</span>}
                  {appointmentId && r.appointmentId === appointmentId && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase">This visit</span>
                  )}
                  {flags > 0 && (
                    <span className="flex items-center gap-1 text-[11px] font-normal text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-3" />
                      {flags} to check
                    </span>
                  )}
                </span>
                <span className="block text-xs text-black/70 dark:text-white/65">
                  {recordDateTime(r.recordedAt)} · {r.durationSeconds.toFixed(0)} s{r.side ? ` · ${r.side} side` : ""}
                  {r.device?.dynamo ? " · with DynaMo" : ""}
                  {r.device?.recordedBy?.name ? ` · ${r.device.recordedBy.name}` : ""}
                </span>
              </span>
              <ChevronDown className={`size-4 shrink-0 text-black/55 transition-transform dark:text-white/60 ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {isOpen && (
              <div className="mt-3 flex flex-col gap-4">
                {r.envelope?.channels?.length ? (
                  <EmgEnvelopeChart
                    envelope={r.envelope}
                    phases={spans}
                    markers={(r.markers ?? []).filter((m) => m.phase === undefined)}
                    force={r.force}
                    muscles={musclesOf(r)}
                  />
                ) : null}
                {r.metrics?.entries?.length ? (
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {r.metrics.entries.map((e) => (
                      <span key={e.id} className="rounded-md border border-black/15 bg-black/[0.04] px-2 py-1 dark:border-white/15 dark:bg-white/[0.06]">
                        {e.label}: <b className="tabular-nums">{e.value}</b>
                        {e.unit ? ` ${e.unit}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
                {r.metrics?.channels && <EmgMetricsView metrics={r.metrics} />}
                {r.notes && <p className="rounded-md bg-black/[0.05] px-3 py-2 text-sm dark:bg-white/[0.07]">{r.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  {r.rawUrl && (
                    <a
                      href={r.rawUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/25 px-3 text-sm font-medium hover:bg-black/[0.07] dark:border-white/25 dark:hover:bg-white/[0.1]"
                    >
                      <Download className="size-3.5" />
                      Raw signal (CSV)
                    </a>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 text-red-600" disabled={deleting === r.id} onClick={() => void remove(r.id)}>
                    {deleting === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
