"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Upload, Send, Search, UserPlus, ArrowRight, Download, ChevronDown, ArrowDownUp } from "lucide-react"
import {
  OPERATIONAL_PHASES,
  OPERATIONAL_STAGES,
  SIDE_FILTERS,
} from "@workspace/db/operational-stage"
import { SIDE_META, SIDE_STAGES, type ContactSide } from "@workspace/db/contact-side"
import { LEAD_STATUSES, leadStatusMeta } from "@workspace/db/lead-status"
import { AddLeadDialog } from "@/src/components/add-lead-dialog"
import { LeadImportDialog } from "@/src/components/lead-import-dialog"
import { LeadBroadcastDialog } from "@/src/components/lead-broadcast-dialog"
import { LeadExportDialog } from "@/src/components/lead-export-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import { ListPagination, type PageSize } from "@/src/components/list-pagination"
import { MultiSelectFilter } from "@/src/components/multi-select-filter"
import { DateRangeFilter } from "@/src/components/date-range-filter"

interface PersonRow {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  stage: string
  engagement: string | null
  source: string | null
  campaign: string | null
  createdAt: string
  /** Newest lead form or when they were added, whichever is later. */
  enquiredAt?: string | null
  lastTouchAt: string | null
  leadStatus: string | null
  callbackAt: string | null
  interest: string | null
  city: string | null
  assignedRole: string | null
  assignedUserId: string | null
  assignedUserName: string | null
}

/** The same search, run against the list this page is not showing. */
interface Elsewhere {
  side: ContactSide
  count: number
  permitted: boolean
}


const STAGE_STYLE: Record<string, string> = {
  AUDIENCE: "bg-slate-100 text-slate-600",
  LEAD: "bg-blue-100 text-blue-700",
  BOOKED: "bg-indigo-100 text-indigo-700",
  PATIENT: "bg-green-100 text-green-700",
  INACTIVE: "bg-amber-100 text-amber-700",
  LOST: "bg-muted/5 text-muted-foreground",
}

const STAGE_HINT: Record<string, string> = {
  LEAD: "Known to us, not converted yet.",
  BOOKED: "Has an appointment, not seen yet.",
  PATIENT: "Attended — now on the clinical side.",
  INACTIVE: "Was a patient, has gone quiet.",
  LOST: "Disqualified or explicitly not interested.",
}

// The derived funnel stops at the first attended visit, so every bucket but
// its last describes a lead. Offering it on the patient list would be eight
// options that all return the same rows.
const FUNNEL_STAGES: Record<ContactSide, string[]> = {
  leads: OPERATIONAL_STAGES.filter((s) => s.stage !== "PATIENT").map((s) => s.stage),
  patients: ["PATIENT"],
}

// Exits and flags worth filtering by on each list. No-show, cancelled and
// do-not-contact happen on both sides of the line.
const FLAGS: Record<ContactSide, string[]> = {
  leads: ["LOST", "NO_SHOW", "CANCELLED", "DO_NOT_CONTACT"],
  patients: ["INACTIVE", "NO_SHOW", "CANCELLED", "DO_NOT_CONTACT"],
}

// Compact on purpose: seven filters share one row, and at text-sm with
// roomy padding they wrapped onto two and pushed the list itself down the
// screen. h-8 keeps every control — select, search, toggle — the same height.
const selectClass =
  "h-8 rounded-md border border-border bg-background px-2 text-xs focus:border-ring focus:outline-none"


/**
 * One of the two people lists — leads, or patients.
 *
 * There was a single "People" screen with stage as a filter, and before that a
 * Leads page and a Contacts page reading the same table with different
 * defaults. The merge fixed a real problem: somebody would look for a patient
 * on the leads page, not find them, and conclude we had no record of them.
 *
 * The split is back because the grant matters more than the screen — chasing
 * enquiries and looking after people under care are different jobs, and one
 * permission for both meant staffing the first handed over the second. What
 * stops the old problem returning is the search: a name that is not on this
 * list but is on the other one now says so, and links there, instead of
 * showing an empty table. Both pages render this component; what differs is
 * only which stages they are allowed to see.
 */
export function PeopleList({ side }: { side: ContactSide }) {
  // useSearchParams needs a Suspense boundary above it — without one Next
  // refuses to prerender the route at build time.
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      }
    >
      <List side={side} />
    </Suspense>
  )
}

function List({ side }: { side: ContactSide }) {
  const searchParams = useSearchParams()
  const meta = SIDE_META[side]
  const stages = SIDE_STAGES[side]
  const isLeads = side === "leads"

  const [people, setPeople] = useState<PersonRow[]>([])
  const [elsewhere, setElsewhere] = useState<Elsewhere | null>(null)
  const [loading, setLoading] = useState(true)
  const [truncated, setTruncated] = useState(false)
  // Server-side pages, the same 50 / 100 / 200 as the clinic's long lists.
  // Page, size, search and every filter live in the URL too, so going into a
  // lead and pressing Back lands on exactly the view that was open.
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1))
  const [pageSize, setPageSize] = useState<PageSize>(() => {
    const n = Number(searchParams.get("limit"))
    return (n === 100 || n === 200 ? n : 50) as PageSize
  })
  const [total, setTotal] = useState(0)

  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  // Home's funnel links here with ?stage= / ?operationalStage= / ?side=, so
  // arriving from a number lands on the people behind it.
  // Every filter takes several values at once (comma separated in the URL);
  // an empty list means not filtered.
  const listParam = (key: string) => (searchParams.get(key) ?? "").split(",").filter(Boolean)
  const [stageFilter, setStageFilter] = useState<string[]>(listParam("stage"))
  const [operationalStage, setOperationalStage] = useState<string[]>(listParam("operationalStage"))
  const [flag, setFlag] = useState<string[]>(listParam("side"))
  const [engagedOnly, setEngagedOnly] = useState(
    searchParams.get("engagedNotConverted") === "true",
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Lead work filters. "Open" hides closed dispositions (visited, not
  // interested, invalid ...) — what a caller's day actually consists of.
  const [leadStatus, setLeadStatus] = useState<string[]>(listParam("leadStatus"))
  const [assignee, setAssignee] = useState<string[]>(listParam("assignee"))
  const [callbackDue, setCallbackDue] = useState(searchParams.get("callbackDue") === "true")
  const [canSeeAll, setCanSeeAll] = useState(true)
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([])
  const [icps, setIcps] = useState<{ code: string; name: string }[]>([])
  const [icpFilter, setIcpFilter] = useState<string[]>(listParam("interest"))
  const [region, setRegion] = useState<string[]>(listParam("region"))
  // Last-enquiry date range, YYYY-MM-DD, IST days, both ends included.
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "")
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "")

  useEffect(() => {
    if (!isLeads) return
    fetch("/api/icps")
      .then((r) => r.json())
      .then((d) => setIcps(d.icps ?? []))
      .catch(() => setIcps([]))
  }, [isLeads])

  const [importOpen, setImportOpen] = useState(false)
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [addLeadOpen, setAddLeadOpen] = useState(false)

  useEffect(() => {
    if (!isLeads || !canSeeAll) return
    fetch("/api/staff/assignable")
      .then((r) => r.json())
      .then((d) => setStaff(d.people ?? []))
      .catch(() => setStaff([]))
  }, [isLeads, canSeeAll])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ list: side })
    if (isLeads) {
      if (leadStatus.length) params.set("leadStatus", leadStatus.join(","))
      if (assignee.length) params.set("assignee", assignee.join(","))
      if (callbackDue) params.set("callbackDue", "true")
      if (icpFilter.length) params.set("interest", icpFilter.join(","))
      if (region.length) params.set("region", region.join(","))
    }
    if (flag.length) params.set("side", flag.join(","))
    else if (operationalStage.length) params.set("operationalStage", operationalStage.join(","))
    else if (engagedOnly) params.set("engagedNotConverted", "true")
    else if (stageFilter.length) params.set("stage", stageFilter.join(","))
    if (dateFrom) params.set("dateFrom", dateFrom)
    if (dateTo) params.set("dateTo", dateTo)
    if (search.trim()) params.set("q", search.trim())
    params.set("page", String(page))
    params.set("limit", String(pageSize))

    // Mirror the view into the address bar (defaults left out) without a navigation.
    const shown = new URLSearchParams(params)
    shown.delete("list")
    if (page === 1) shown.delete("page")
    if (pageSize === 50) shown.delete("limit")
    const url = new URL(window.location.href)
    url.search = shown.toString()
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url)

    fetch(`/api/leads?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setPeople(data.leads ?? [])
        setTruncated(data.truncated ?? false)
        setTotal(typeof data.total === "number" ? data.total : (data.leads ?? []).length)
        setElsewhere(data.elsewhere ?? null)
        if (typeof data.canSeeAll === "boolean") setCanSeeAll(data.canSeeAll)
      })
      .finally(() => setLoading(false))
  }, [side, stageFilter, search, engagedOnly, operationalStage, flag, isLeads, leadStatus, assignee, callbackDue, icpFilter, region, dateFrom, dateTo, page, pageSize])

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  // A selection that survives a filter change would let Send reach contacts
  // no longer on screen — clear it whenever the visible set changes.
  useEffect(() => {
    setSelected(new Set())
  }, [stageFilter, search, engagedOnly, operationalStage, flag, leadStatus, assignee, callbackDue, icpFilter, region, dateFrom, dateTo, page, pageSize])

  // A new filter starts again at page one — page 7 of the old list may not exist.
  // Not on the first render: that is a view restored from the URL, page included.
  const filterKey = JSON.stringify([stageFilter, search, engagedOnly, operationalStage, flag, leadStatus, assignee, callbackDue, icpFilter, region, dateFrom, dateTo, pageSize])
  const lastFilterKey = useRef(filterKey)
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return
    lastFilterKey.current = filterKey
    setPage(1)
  }, [stageFilter, search, engagedOnly, operationalStage, flag, leadStatus, assignee, callbackDue, icpFilter, region, dateFrom, dateTo, pageSize])

  const allSelected = people.length > 0 && selected.size === people.length

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(people.map((p) => p.id)))
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedIds = useMemo(() => [...selected], [selected])
  const funnelStages = useMemo(() => new Set(FUNNEL_STAGES[side]), [side])
  const flags = useMemo(() => new Set<string>(FLAGS[side]), [side])

  return (
    <div className="space-y-4">
      <PageHeader
        title={meta.label}
        description={meta.blurb || undefined}
        actions={
          <>
            {isLeads && (
              <>
                <Button size="sm" onClick={() => setAddLeadOpen(true)}>
                  <UserPlus />
                  Add lead
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
                <ArrowDownUp />
                {isLeads ? "Import / Export" : "Export"}
                <ChevronDown className="opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {isLeads && (
                  <DropdownMenuItem onClick={() => setImportOpen(true)}>
                    <Upload />
                    Import CSV
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setExportOpen(true)}>
                  <Download />
                  Export (CSV / Excel)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" onClick={() => setBroadcastOpen(true)} disabled={selected.size === 0}>
              <Send />
              Send template{selected.size > 0 && ` (${selected.size})`}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone, email or source"
            className={`${selectClass} w-52 pl-6`}
          />
        </div>
        <DateRangeFilter
          from={dateFrom}
          to={dateTo}
          label="Date"
          onChange={(f, t) => {
            setDateFrom(f)
            setDateTo(t)
          }}
        />
        {isLeads && (
          <>
            <MultiSelectFilter
              label="Status"
              value={leadStatus}
              onChange={setLeadStatus}
              options={[
                { value: "OPEN", label: "Open (still being worked)" },
                ...LEAD_STATUSES.map((st) => ({ value: st.key, label: st.label })),
              ]}
            />
            <MultiSelectFilter
              label="Owner"
              value={assignee}
              onChange={setAssignee}
              options={[
                { value: "me", label: "Assigned to me" },
                { value: "unassigned", label: "Not claimed yet" },
                ...(canSeeAll ? staff.map((p) => ({ value: p.id, label: p.name })) : []),
              ]}
            />
            {icps.length > 0 && (
              <MultiSelectFilter
                label="ICP"
                value={icpFilter}
                onChange={setIcpFilter}
                options={icps.map((i) => ({ value: i.code, label: i.name }))}
              />
            )}
            <MultiSelectFilter
              label="Region"
              value={region}
              onChange={setRegion}
              title="From the campaign (Kolkata ads are marked | Kol |), otherwise the city they gave"
              options={[
                { value: "DELHI", label: "Delhi NCR" },
                { value: "KOLKATA", label: "Kolkata" },
                { value: "OTHER", label: "Other / unknown" },
              ]}
            />
          </>
        )}
        {isLeads && (
          <MultiSelectFilter
            label="Funnel"
            value={operationalStage}
            onChange={(next) => {
              setOperationalStage(next)
              if (next.length) {
                setFlag([])
                setEngagedOnly(false)
              }
            }}
            options={OPERATIONAL_PHASES.flatMap((phase) =>
              OPERATIONAL_STAGES.filter((st) => st.phase === phase.phase && funnelStages.has(st.stage)).map((st) => ({
                value: st.stage,
                label: st.label,
                group: phase.label,
              })),
            )}
          />
        )}
        <MultiSelectFilter
          label="Flags"
          value={flag}
          onChange={(next) => {
            setFlag(next)
            if (next.length) {
              setOperationalStage([])
              setEngagedOnly(false)
            }
          }}
          options={SIDE_FILTERS.filter((f) => flags.has(f.key)).map((f) => ({ value: f.key, label: f.label }))}
        />
        <MultiSelectFilter
          label="Stage"
          value={stageFilter}
          onChange={setStageFilter}
          disabled={engagedOnly || operationalStage.length > 0 || flag.length > 0}
          title="The stored lifecycle value, not the derived funnel stage"
          options={stages.map((stage) => ({ value: stage, label: stage }))}
        />
        {isLeads && (
          <Button
            onClick={() => {
              setEngagedOnly((v) => !v)
              setOperationalStage([])
              setFlag([])
            }} size="sm" variant={engagedOnly ? "default" : "outline"}>
            Replied, not booked
          </Button>
        )}
        {isLeads && (
          <Button onClick={() => setCallbackDue((v) => !v)} size="sm" variant={callbackDue ? "default" : "outline"}>
            Callbacks due
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {total} {total === 1 ? "person" : "people"}
          {truncated && " (capped at 1000 — narrow the filter to see the rest)"}
          {/* The explanation only fits when one value is picked. */}
          {flag.length === 1
            ? ` · ${SIDE_FILTERS.find((f) => f.key === flag[0])?.derivedFrom ?? ""}`
            : operationalStage.length === 1
              ? ` · ${OPERATIONAL_STAGES.find((st) => st.stage === operationalStage[0])?.derivedFrom ?? ""}`
              : engagedOnly
                ? " · leads who answered us but still have no appointment"
                : stageFilter.length === 1 && STAGE_HINT[stageFilter[0]!]
                  ? ` · ${STAGE_HINT[stageFilter[0]!]}`
                  : ""}
        </span>
      </div>

      {/* The whole reason the split is safe to make. Searching for someone who
          sits on the other list used to return nothing at all, which reads as
          "there is no record of this person" and ends in a duplicate. */}
      {elsewhere && elsewhere.count > 0 && <ElsewhereHint elsewhere={elsewhere} />}

      {loading ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : people.length === 0 ? (
        <p className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
          {search.trim()
            ? `Nobody on ${meta.label} matches that.`
            : isLeads
              ? "No leads here yet. Import a CSV to get started."
              : "No patients here yet. People arrive on this list once they attend."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="cursor-pointer"
                  />
                </th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                {isLeads && <th className="px-3 py-2 font-medium">Lead status</th>}
                {isLeads && <th className="px-3 py-2 font-medium">ICP · city</th>}
                {isLeads && <th className="px-3 py-2 font-medium">Owner</th>}
                <th className="px-3 py-2 font-medium">{isLeads ? "Source" : "Last contact"}</th>
                <th className="px-3 py-2 font-medium">{isLeads ? "Last enquiry" : "Added"}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr
                  key={person.id}
                  className={`border-b border-border last:border-0 ${
                    selected.has(person.id) ? "bg-muted" : "hover:bg-muted"
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(person.id)}
                      onChange={() => toggleOne(person.id)}
                      aria-label={`Select ${person.name ?? person.phone ?? person.id}`}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/contacts/${person.id}`} className="hover:underline">
                      {person.name ?? <span className="text-muted-foreground">No name</span>}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {person.phone}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {person.email ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        STAGE_STYLE[person.stage] ?? "bg-muted/5 text-muted-foreground"
                      }`}
                    >
                      {person.stage}
                    </span>
                    {person.engagement === "DO_NOT_CONTACT" && (
                      <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">
                        DNC
                      </span>
                    )}
                  </td>
                  {isLeads && (
                    <td className="px-3 py-2">
                      {(() => {
                        const m = leadStatusMeta(person.leadStatus)
                        return m ? (
                          <span className={`rounded px-1.5 py-0.5 text-[11px] ${m.tone}`}>{m.label}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )
                      })()}
                      {person.leadStatus === "CALLBACK_LATER" && person.callbackAt && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(person.callbackAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                      )}
                    </td>
                  )}
                  {isLeads && (
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {[
                        person.interest && (icps.find((i) => i.code === person.interest)?.name ?? person.interest.replace(/_/g, " ")),
                        person.city,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                  )}
                  {isLeads && (
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {person.assignedUserName ?? (person.assignedRole ? `${person.assignedRole} pool` : "—")}
                    </td>
                  )}
                  {/* Where a lead came from is the question on the lead list.
                      For a patient it is answered and gone — how long since
                      anyone spoke to them is what matters. */}
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {isLeads ? (
                      <>
                        {person.source ?? "—"}
                        {person.campaign && <span> · {person.campaign}</span>}
                      </>
                    ) : person.lastTouchAt ? (
                      new Date(person.lastTouchAt).toLocaleDateString()
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(isLeads ? (person.enquiredAt ?? person.createdAt) : person.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > 0 && (
        <ListPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={(p) => {
            setPage(p)
            window.scrollTo({ top: 0, behavior: "smooth" })
          }}
          onPageSize={setPageSize}
        />
      )}

      {isLeads && (
        <>
          <AddLeadDialog open={addLeadOpen} onOpenChange={setAddLeadOpen} onCreated={load} />
          <LeadImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={load} />
        </>
      )}
      <LeadBroadcastDialog
        open={broadcastOpen}
        onOpenChange={setBroadcastOpen}
        contactIds={selectedIds}
        onSent={load}
      />
      <LeadExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        side={side}
        total={total}
        selectedIds={selectedIds}
      />
    </div>
  )
}

/**
 * "They are not here, they are over there."
 *
 * Shown even to someone who cannot follow the link, because knowing the record
 * exists is most of what they needed — without it they create a second one.
 * The count comes from the API; this page never receives the rows behind it.
 */
function ElsewhereHint({ elsewhere }: { elsewhere: Elsewhere }) {
  const other = SIDE_META[elsewhere.side]
  const n = elsewhere.count

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        {n === 1
          ? `1 person matching this search is on ${other.label}.`
          : `${n} people matching this search are on ${other.label}.`}
      </span>
      {elsewhere.permitted ? (
        <Link
          href={other.route}
          className="flex items-center gap-1 font-medium text-foreground hover:underline"
        >
          Open {other.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground">
          You do not have access to that list — ask an administrator.
        </span>
      )}
    </div>
  )
}
