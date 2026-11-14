"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Check,
  Lock,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { PermissionTable, type PermissionRow } from "../permission-table"

interface RoleRow {
  key: string
  label: string
  description: string | null
  panel: "clinic" | "operations" | "both" | "patient"
  isSystem: boolean
  sortOrder: number
  userCount: number
  permissionCount: number
}

interface Grant {
  role: string
  permissions: string[]
}

const PANEL_OPTIONS = [
  { value: "clinic", label: "Clinic panel", hint: "Charts, appointments, patients" },
  { value: "operations", label: "Operations console", hint: "Leads, inbox, front desk" },
  { value: "both", label: "Both", hint: "Administrative — works across the clinic" },
] as const

const PANEL_LABEL: Record<string, string> = {
  clinic: "Clinic",
  operations: "Operations",
  both: "Both panels",
  patient: "Patient app",
}

// Superadmin bypasses the permission tables, so moving it could land the only
// account that can undo the change in an app with no admin pages. The patient
// roles are branched on by the code — onboarding, the staff picker. Everything
// else is a staffing decision, and clinics restaff.
const PANEL_LOCKED = new Set(["superadmin", "patient", "user"])

function panelsOf(panel: string): string[] {
  if (panel === "both") return ["clinic", "operations"]
  if (panel === "clinic" || panel === "operations") return [panel]
  return []
}

/**
 * Roles, and the pages each one opens.
 *
 * The two used to be separate ideas — a role was an enum in code and only its
 * permissions were editable — which meant a clinic could not name a role the
 * code had not anticipated. They belong on one screen because they are one
 * decision: what this job is, and what it can reach.
 *
 * One role at a time rather than a grid of every role against every page. The
 * grid was unreadable at eight roles and thirty pages, and nobody configures
 * two roles in the same sitting anyway.
 */
export function RoleManager() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [selectedKey, setSelectedKey] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/superadmin/roles")
    const data = await res.json().catch(() => null)
    const list: RoleRow[] = data?.roles ?? []
    setRoles(list)
    setPermissions(data?.permissions ?? [])
    setGrants(data?.grants ?? [])
    setSelectedKey((current) => {
      if (current && list.some((r) => r.key === current)) return current
      return list.find((r) => r.panel !== "patient")?.key ?? list[0]?.key ?? ""
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const selected = useMemo(
    () => roles.find((r) => r.key === selectedKey) ?? null,
    [roles, selectedKey],
  )

  const held = useMemo(
    () => new Set(grants.find((g) => g.role === selectedKey)?.permissions ?? []),
    [grants, selectedKey],
  )

  // Only the panels this role works in. A doctor's list has no business
  // containing lead-nurture flows — the role cannot reach that panel at all,
  // and listing them buries the rows that matter.
  const visible = useMemo(() => {
    if (!selected) return []
    const panels = new Set(panelsOf(selected.panel))
    return permissions.filter((p) => panels.has(p.panel))
  }, [permissions, selected])

  const togglePermission = async (permission: string, next: boolean) => {
    if (!selected) return
    setBusy(permission)
    setError(null)
    try {
      const res = await fetch("/api/superadmin/permissions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: selected.key, permission, granted: next }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "Could not update")
        return
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  const removeRole = async (role: RoleRow) => {
    setError(null)
    const res = await fetch(`/api/superadmin/roles/${role.key}`, { method: "DELETE" })
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Could not delete the role")
      return
    }
    setSelectedKey("")
    await load()
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 text-black lg:p-6 dark:text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Roles</h1>
        </div>
        <Button variant="simple" size="lg" className="active:scale-95"
 onClick={() => setCreating(true)}

 >
          <Plus className="h-4 w-4" />
          New role
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="flex flex-col gap-1.5">
          {roles.map((role) => {
            const isActive = role.key === selectedKey
            return (
              <Button variant="ghost" size="default"
                key={role.key}
                onClick={() => setSelectedKey(role.key)}
                className={`h-auto justify-start whitespace-normal text-left border px-3 py-2.5 text-left transition-colors ${
 isActive
 ?"border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
 :"border-black/18 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
 }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{role.label}</span>
                  {role.isSystem && (
                    <Lock className={`h-3 w-3 ${isActive ? "opacity-60" : "opacity-30"}`} />
                  )}
                </div>
                <div
                  className={`mt-0.5 flex items-center gap-2 text-[11px] ${
                    isActive ? "opacity-70" : "text-black/60 dark:text-white/40"
                  }`}
                >
                  <span>{PANEL_LABEL[role.panel]}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {role.userCount}
                  </span>
                  <span>·</span>
                  <span>{role.permissionCount} pages</span>
                </div>
              </Button>
            )
          })}
        </div>

        <div>
          {selected ? (
            <RoleDetail
              role={selected}
              rows={visible}
              held={held}
              busyKey={busy}
              onToggle={togglePermission}
              onDelete={() => removeRole(selected)}
              onSaved={load}
              onError={setError}
            />
          ) : (
            <p className="text-sm text-black/60 dark:text-white/50">Pick a role.</p>
          )}
        </div>
      </div>

      {creating && (
        <CreateRoleDialog
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={async (key) => {
            setCreating(false)
            await load()
            setSelectedKey(key)
          }}
        />
      )}
    </div>
  )
}

function RoleDetail({
  role,
  rows,
  held,
  busyKey,
  onToggle,
  onDelete,
  onSaved,
  onError,
}: {
  role: RoleRow
  rows: PermissionRow[]
  held: Set<string>
  busyKey: string | null
  onToggle: (key: string, next: boolean) => void
  onDelete: () => void
  onSaved: () => Promise<void>
  onError: (message: string | null) => void
}) {
  const [label, setLabel] = useState(role.label)
  const [panel, setPanel] = useState(role.panel)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setLabel(role.label)
    setPanel(role.panel)
    setConfirmDelete(false)
  }, [role.key, role.label, role.panel])

  // Built-in is not the same as fixed. Only superadmin and the patient role
  // have a scope the code itself branches on — see canChangePanel.
  const panelLocked = PANEL_LOCKED.has(role.key)

  // Narrowing a role's scope deletes the grants the new panel cannot show —
  // see updateRole. That is right (a grant nothing can render is a lie) but it
  // is not undoable, so say which pages will go before the button is pressed
  // rather than after.
  const droppedByMove = useMemo(() => {
    if (panel === role.panel) return []
    const keep = new Set(panelsOf(panel))
    return rows.filter((r) => held.has(r.key) && !keep.has(r.panel))
  }, [panel, role.panel, rows, held])

  const dirty = label.trim() !== role.label || panel !== role.panel

  const save = async () => {
    setSaving(true)
    onError(null)
    try {
      const res = await fetch(`/api/superadmin/roles/${role.key}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, panel }),
      })
      if (!res.ok) {
        onError((await res.json().catch(() => null))?.error ?? "Could not save")
        return
      }
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  const isSuperadmin = role.key === "superadmin"

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-black/18 p-4 dark:border-white/10">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[200px]">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
              Name
            </span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border border-black/18 bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-black dark:focus:border-white/30"
            />
          </label>

          <label className="min-w-[180px]">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
              Works in
            </span>
            <select
              value={panel}
              disabled={panelLocked}
              onChange={(e) => setPanel(e.target.value as RoleRow["panel"])}
              className="w-full rounded-md border border-black/18 bg-white px-3 py-2 text-sm outline-none focus:border-black/30 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:focus:border-white/30"
            >
              {role.panel === "patient" ? (
                <option value="patient">Patient app</option>
              ) : (
                PANEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))
              )}
            </select>
          </label>

          {dirty && (
            <Button variant="simple" size="default"
 onClick={save}
 disabled={saving}

 >
              {saving ? <PredictSpinner className="size-4" /> : <Check className="h-4 w-4" />}
              Save
            </Button>
          )}

          {!role.isSystem &&
            (confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <Button variant="destructive" size="default" className="text-white"
 onClick={onDelete}

 >
                  Delete {role.label}
                </Button>
                <Button variant="outline" size="default"
 onClick={() => setConfirmDelete(false)}

 >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="default" className="text-black/60 hover:border-red-300 hover:text-red-600 dark:text-white/60"
 onClick={() => setConfirmDelete(true)}

 >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ))}
        </div>

        {droppedByMove.length > 0 && (
          <p className="mt-2.5 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Saving this moves <strong>{role.label}</strong> out of a panel it currently holds pages
            in, so {droppedByMove.length} {droppedByMove.length === 1 ? "page" : "pages"} will be
            removed from it: {droppedByMove.map((r) => r.label).join(", ")}. Pick
            <strong> Both panels</strong> to keep them.
          </p>
        )}

        <p className="mt-2.5 text-xs text-black/60 dark:text-white/40">
          {panelLocked ? (
            <>
              <strong>{role.label}</strong> is one of the roles the code itself branches on, so
              where it works is fixed. Its pages are still yours to set. Key:{" "}
              <code className="font-mono">{role.key}</code>
            </>
          ) : role.isSystem ? (
            <>
              <strong>{role.label}</strong> is built in, so it cannot be deleted — but where it
              works and what it opens are both yours to change. Moving it drops any pages the new
              panel cannot show. Key: <code className="font-mono">{role.key}</code>
            </>
          ) : (
            <>
              Key: <code className="font-mono">{role.key}</code> — never changes, because accounts
              and grants are stored against it. Renaming only changes what is displayed.
            </>
          )}
        </p>
      </div>

      {isSuperadmin ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-amber-900 dark:text-amber-200">
            Superadmin opens everything and bypasses these tables. That is deliberate: revoking
            this page from the only role that can reach it would lock the door with the key inside.
          </p>
        </div>
      ) : role.panel === "patient" ? (
        <p className="text-sm text-black/60 dark:text-white/50">
          Patients use their own app, which has no staff pages to grant.
        </p>
      ) : (
        <PermissionTable
          rows={rows}
          isOn={(key) => held.has(key)}
          busyKey={busyKey}
          onToggle={onToggle}
          columnLabel="Default"
        />
      )}
    </div>
  )
}

function CreateRoleDialog({
  roles,
  onClose,
  onCreated,
}: {
  roles: RoleRow[]
  onClose: () => void
  onCreated: (key: string) => void
}) {
  const [label, setLabel] = useState("")
  const [panel, setPanel] = useState<"clinic" | "operations" | "both">("operations")
  const [copyFrom, setCopyFrom] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Copying from a role in another panel would drop most of what it holds, so
  // only the ones whose pages this role can actually keep are offered.
  const sources = roles.filter((r) => {
    if (r.panel === "patient" || r.key === "superadmin") return false
    if (panel === "both") return true
    return r.panel === panel || r.panel === "both"
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/superadmin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, panel, description, copyFrom: copyFrom || null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not create the role")
        return
      }
      onCreated(data.role.key)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-lg border border-black/18 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-black"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">New role</h2>
            <p className="mt-0.5 text-sm text-black/60 dark:text-white/50">
              Name the job, say where it works, and start from a role that already exists.
            </p>
          </div>
          <Button variant="ghost" size="default" className="text-black/65 dark:text-white/40" type="button" onClick={onClose} >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
              Name
            </span>
            <input
              autoFocus
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Therapist"
              className="w-full rounded-md border border-black/18 bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-black dark:focus:border-white/30"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
              Works in
            </span>
            <div className="flex flex-col gap-1.5">
              {PANEL_OPTIONS.map((o) => (
                <Button variant="ghost" size="default"
                  type="button"
                  key={o.value}
                  onClick={() => {
                    setPanel(o.value)
                    setCopyFrom("")
                  }}
                  className={`h-auto justify-start whitespace-normal text-left border px-3 py-2 text-left text-sm transition-colors ${
 panel === o.value
 ?"border-black dark:border-white"
 :"border-black/18 hover:border-black/30 dark:border-white/10"
 }`}
                >
                  <span className="font-medium">{o.label}</span>
                  <span className="ml-2 text-xs text-black/60 dark:text-white/40">{o.hint}</span>
                </Button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-black/60 dark:text-white/40">
              This also decides where they land after signing in.
            </p>
          </div>

          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
              Start from
            </span>
            <select
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              className="w-full rounded-md border border-black/18 bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-black dark:focus:border-white/30"
            >
              <option value="">No pages — start empty</option>
              {sources.map((r) => (
                <option key={r.key} value={r.key}>
                  Copy {r.label} ({r.permissionCount} pages)
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-black/60 dark:text-white/40">
              You can change every page afterwards. Copying is just a faster start.
            </span>
          </label>

          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
              What they do <span className="normal-case opacity-60">(optional)</span>
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Runs physiotherapy sessions and logs exercise adherence."
              className="w-full rounded-md border border-black/18 bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-black dark:focus:border-white/30"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="default"
 type="button"
 onClick={onClose}

 >
            Cancel
          </Button>
          <Button variant="simple" size="default"
 type="submit"
 disabled={saving || !label.trim()}

 >
            {saving && <PredictSpinner className="size-4" />}
            Create role
          </Button>
        </div>
      </form>
    </div>
  )
}
