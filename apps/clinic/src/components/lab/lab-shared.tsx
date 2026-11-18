"use client"

export type LabStage = "to_book" | "booked" | "on_the_way" | "collected" | "in_lab" | "reported" | "cancelled"

export interface LabOrderRow {
  id: string
  stage: LabStage
  status: string
  orderedOn: string
  scheduledAt: string | null
  collectionMode: string | null
  technician: string | null
  technicianUserId: string | null
  collectionAddress: string | null
  kitCode: string | null
  totalInPaise: number
  paidInPaise: number
  items: number
  patient: { chartId: string; code: string; name: string; phone: string | null }
  hospital: { id: string | null; name: string | null; partner: boolean }
  orderedBy: string | null
}

const STAGE: Record<LabStage, { label: string; tone: string }> = {
  to_book: { label: "To book", tone: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  booked: { label: "Booked", tone: "bg-sky-500/15 text-sky-800 dark:text-sky-300" },
  on_the_way: { label: "On the way", tone: "bg-blue-500/15 text-blue-800 dark:text-blue-300" },
  collected: { label: "Collected", tone: "bg-violet-500/15 text-violet-800 dark:text-violet-300" },
  in_lab: { label: "In lab", tone: "bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300" },
  reported: { label: "Reported", tone: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" },
  cancelled: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
}

export function StageBadge({ stage }: { stage: LabStage }) {
  const s = STAGE[stage]
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>
}

export const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

export function formatSlot(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** YYYY-MM-DD in India. */
export function istDay(at = new Date(), offsetDays = 0) {
  return new Date(at.getTime() + 5.5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10)
}
