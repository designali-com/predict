"use client"

import * as React from "react"
import { useCallback, useEffect, useState } from "react"
import { Check, Copy, MessageCircle, Plus, Trash2, TriangleAlert, UserPlus } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@workspace/ui/components/predict-loader"

/**
 * One clinic's team: who works there and in what role, adding someone (a new
 * login with a welcome link, or existing staff), and taking someone off.
 *
 * Shared by the operations console (Clinics → a clinic → Team) and the
 * clinic panel's own Team page, so the two never drift apart. Each app hands
 * in its own API; both answer the same shapes:
 *   GET    apiBase                  → { staff, roles, addable }
 *   POST   apiBase                  → { role, userId } | { role, newUser, sendEmail }
 *   DELETE apiBase?userId=&disableLogin=1
 *   GET    apiBase/impact?userId=   → what removing them would touch
 */

interface StaffRow {
  userId: string
  name: string
  email: string
  role: string
  isActive: boolean
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none disabled:opacity-60"
const labelClass = "mb-1 block text-xs font-medium text-muted-foreground"
const primary =
  "flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
const ghost =
  "flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"


export function ClinicTeam({
  apiBase,
  note,
}: {
  /** This app's team API — see the shapes above. */
  apiBase: string
  /** A line under the list — what the role means in this panel. */
  note?: React.ReactNode
}) {
  const [staff, setStaff] = useState<StaffRow[]>([])
  // The signed-in person, so their own row offers no remove or role change.
  const [me, setMe] = useState<string | null>(null)
  const [roles, setRoles] = useState<{ key: string; label: string }[]>([])
  const [addable, setAddable] = useState<{ id: string; name: string; email: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<StaffRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await fetch(apiBase).then((r) => r.json())
    setStaff(d.staff ?? [])
    setMe(d.me ?? null)
    setRoles(d.roles ?? [])
    setAddable(d.addable ?? [])
  }, [apiBase])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.label ?? key

  async function changeRole(userId: string, role: string) {
    setError(null)
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(d.error ?? "Could not change the role")
      return setError(d.error ?? "Could not change the role")
    }
    toast.success("Role updated")
    load()
  }

  // Asked in a popup that says what happens, not a browser confirm().
  function remove(s: StaffRow) {
    setError(null)
    setRemoving(s)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <PredictSpinner className="size-7" />
      </div>
    )
  }

  // How many hold each role here, for the summary above the list.
  const byRole = roles
    .map((r) => ({ ...r, n: staff.filter((s) => s.role === r.key).length }))
    .filter((r) => r.n > 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {byRole.length === 0 ? (
            <span className="text-sm text-muted-foreground">Nobody works here yet — add an admin and the doctors first.</span>
          ) : (
            byRole.map((r) => (
              <span key={r.key} className="rounded-md border border-border px-2.5 py-1 text-xs">
                <span className="font-semibold tabular-nums">{r.n}</span> {r.label}
              </span>
            ))
          )}
        </div>
        <button type="button" onClick={() => setAdding(true)} className={`${primary} shrink-0`}>
          <UserPlus className="h-4 w-4" /> Add member
        </button>
      </div>

      {staff.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {staff.map((s) => {
            // Your own row: you cannot remove yourself or change your own
            // role from here (the API refuses both too).
            const self = s.userId === me
            return (
            <li key={s.userId} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {s.name}
                  {self && (
                    <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">you</span>
                  )}
                  {!s.isActive && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal">inactive</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{s.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={s.role}
                  onChange={(e) => changeRole(s.userId, e.target.value)}
                  disabled={self}
                  title={self ? "You cannot change your own role" : undefined}
                  aria-label={`Role of ${s.name}`}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:border-ring focus:outline-none disabled:opacity-60"
                >
                  {!roles.some((r) => r.key === s.role) && <option value={s.role}>{roleLabel(s.role)}</option>}
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {self ? (
                  // Keeps the row lined up with the others.
                  <span className="w-7" aria-hidden />
                ) : (
                  <button
                    type="button"
                    onClick={() => remove(s)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600"
                    aria-label={`Remove ${s.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
            )
          })}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        {note ??
          "The role is per clinic — the same person can be a doctor here and an admin at another clinic. What each role can do is set on the Roles page in the clinic panel."}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <AddMemberDialog
        open={adding}
        onOpenChange={setAdding}
        apiBase={apiBase}
        roles={roles}
        addable={addable}
        onAdded={load}
      />
      <RemoveMemberDialog
        member={removing}
        roleLabel={removing ? roleLabel(removing.role) : ""}
        apiBase={apiBase}
        onClose={() => setRemoving(null)}
        onRemoved={load}
      />
    </div>
  )
}

function AddMemberDialog({
  open,
  onOpenChange,
  apiBase,
  roles,
  addable,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiBase: string
  roles: { key: string; label: string }[]
  addable: { id: string; name: string; email: string }[]
  onAdded: () => void
}) {
  const [mode, setMode] = useState<"new" | "existing">("new")
  const [role, setRole] = useState("")
  const [userId, setUserId] = useState("")
  const [person, setPerson] = useState({ name: "", email: "", phone: "" })
  // The welcome link (choose your own password) can also go by email.
  const [sendEmail, setSendEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<{ email: string; password: string; loginUrl?: string } | null>(null)
  const [welcome, setWelcome] = useState<{ url: string; message: string; whatsappTo: string | null } | null>(null)
  const [delivery, setDelivery] = useState<{ email?: { ok: boolean; error?: string } } | null>(null)
  const [copied, setCopied] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  function reset() {
    setMode("new")
    setRole("")
    setUserId("")
    setPerson({ name: "", email: "", phone: "" })
    setSendEmail(true)
    setWelcome(null)
    setShowPassword(false)
    setDelivery(null)
    setError(null)
    setCredentials(null)
    setCopied(false)
  }

  function close(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function add() {
    setBusy(true)
    setError(null)
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "new"
          ? { role, newUser: person, sendEmail }
          : { role, userId },
      ),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      toast.error(d.error ?? "Could not add them")
      return setError(d.error ?? "Could not add them")
    }
    toast.success("Member added")
    onAdded()
    if (d.credentials) {
      setCredentials(d.credentials)
      setWelcome(d.welcome ?? null)
      setDelivery(d.delivery ?? null)
    }
    else close(false)
  }

  async function copy() {
    if (!credentials) return
    try {
      await navigator.clipboard.writeText(welcome?.message ?? `Login: ${credentials.email}\nPassword: ${credentials.password}`)
      setCopied(true)
    } catch {
      setError("Couldn't copy — select the details and copy them by hand.")
    }
  }

  const ready = role && (mode === "new" ? person.name.trim() && person.email.trim() : userId)

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        {credentials ? (
          <>
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>
                Send them this link — they choose their own password and are signed in. It works once, for 7 days.
              </DialogDescription>
            </DialogHeader>
            {welcome && (
              <div className="space-y-2">
                <div className="break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">{welcome.url}</div>
                <a
                  href={`https://wa.me/${welcome.whatsappTo ?? ""}?text=${encodeURIComponent(welcome.message)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  {welcome.whatsappTo ? "Send on WhatsApp" : "Share on WhatsApp"}
                </a>
                <p className="text-[11px] text-muted-foreground">
                  Opens your WhatsApp with the welcome message ready
                  {welcome.whatsappTo ? " to their number" : " — pick the chat"}. Login email: {credentials.email}
                </p>
              </div>
            )}
            {delivery?.email && (
              <p className={`text-xs ${delivery.email.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"}`}>
                {delivery.email.ok ? "✓ Emailed the link to them" : `✗ Email not sent — ${delivery.email.error}`}
              </p>
            )}
            <div className="text-xs text-muted-foreground">
              {showPassword ? (
                <p>
                  Temporary password (if they cannot open the link):{" "}
                  <span className="font-mono text-foreground">{credentials.password}</span> — shown only now.
                </p>
              ) : (
                <button type="button" onClick={() => setShowPassword(true)} className="hover:text-foreground hover:underline">
                  Show a temporary password instead
                </button>
              )}
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <DialogFooter>
              <button type="button" onClick={copy} className={ghost}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy message"}
              </button>
              <button type="button" onClick={() => close(false)} className={primary}>
                Done
              </button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a member</DialogTitle>
              <DialogDescription>Give them a role at this clinic — admin, doctor or any other.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-sm">
              {(
                [
                  ["new", "New person"],
                  ["existing", "Existing staff"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`rounded px-2 py-1.5 font-medium transition ${
                    mode === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "new" ? (
              <div className="grid gap-3">
                <div>
                  <label className={labelClass}>Full name</label>
                  <input
                    value={person.name}
                    onChange={(e) => setPerson((p) => ({ ...p, name: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email (their login)</label>
                  <input
                    value={person.email}
                    onChange={(e) => setPerson((p) => ({ ...p, email: e.target.value }))}
                    inputMode="email"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Mobile (WhatsApp, optional)</label>
                  <input
                    value={person.phone}
                    onChange={(e) => setPerson((p) => ({ ...p, phone: e.target.value }))}
                    inputMode="tel"
                    placeholder="98765 43210"
                    className={inputClass}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Next screen opens your WhatsApp with their welcome link ready to send.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Also email them the welcome link{" "}
                    <span className="text-xs text-muted-foreground">— they set their own password from it</span>
                  </span>
                </label>
              </div>
            ) : (
              <div>
                <label className={labelClass}>Person</label>
                <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputClass}>
                  <option value="">Choose…</option>
                  {addable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.email}
                    </option>
                  ))}
                </select>
                {addable.length === 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Everyone with a staff login already works here.</p>
                )}
              </div>
            )}

            <div>
              <label className={labelClass}>Role at this clinic</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
                <option value="">Choose…</option>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <DialogFooter>
              <button type="button" onClick={() => close(false)} className={ghost}>
                Cancel
              </button>
              <button type="button" onClick={add} disabled={!ready || busy} className={primary}>
                {busy ? <PredictSpinner className="size-4" /> : <Plus className="h-4 w-4" />}
                {mode === "new" ? "Create login & add" : "Add to clinic"}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface RemovalImpact {
  openLeads: number
  openTasks: number
  upcomingAppointments: number
  otherClinics: string[]
  canDisableLogin: boolean
}

/**
 * Taking somebody off this clinic's team. Says up front what moves and what
 * stays, and — for a superadmin — offers to switch their login off too.
 * Switched off, never deleted: deleting a user also deletes the clinical
 * notes they wrote, which belong to the patients' records.
 */
function RemoveMemberDialog({
  member,
  roleLabel,
  apiBase,
  onClose,
  onRemoved,
}: {
  member: StaffRow | null
  roleLabel: string
  apiBase: string
  onClose: () => void
  onRemoved: () => void
}) {
  const [impact, setImpact] = useState<RemovalImpact | null>(null)
  // The summary failing to load must not block the removal itself.
  const [impactFailed, setImpactFailed] = useState(false)
  const [disableLogin, setDisableLogin] = useState(false)
  // Must read exactly DELETE before the button wakes up.
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setImpact(null)
    setImpactFailed(false)
    setDisableLogin(false)
    setTyped("")
    setError(null)
    if (!member) return
    fetch(`${apiBase}/impact?userId=${member.userId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setImpact(d))
      .catch(() => setImpactFailed(true))
  }, [member, apiBase])

  async function confirm() {
    if (!member || typed !== "DELETE") return
    setBusy(true)
    setError(null)
    const res = await fetch(
      `${apiBase}?userId=${member.userId}${disableLogin ? "&disableLogin=1" : ""}`,
      { method: "DELETE" },
    )
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(d.error ?? "Could not remove them")
      toast.error(d.error ?? "Could not remove them")
      return
    }
    toast.success(d.loginDisabled ? `${member.name} removed and login switched off` : `${member.name} removed`)
    onClose()
    onRemoved()
  }

  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Remove {member?.name}?</DialogTitle>
          <DialogDescription>
            {member?.email} · {roleLabel} at this clinic
          </DialogDescription>
        </DialogHeader>

        {!impact && impactFailed ? (
          <p className="text-sm text-muted-foreground">
            They stop working at this clinic; their open leads and tasks go back to the team, and their past work stays.
            (Could not load the details just now.)
          </p>
        ) : !impact ? (
          <div className="flex justify-center py-6">
            <PredictSpinner className="size-6" />
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">What happens</p>
              <ul className="space-y-1.5">
                <li>• They stop working at this clinic and lose access to its screens.</li>
                <li>
                  • {impact.openLeads ? n(impact.openLeads, "open lead goes", "open leads go") : "Their open leads (none) go"}{" "}
                  back to the {roleLabel.toLowerCase()} pool — the next caller picks them up.
                </li>
                <li>
                  • {impact.openTasks ? n(impact.openTasks, "open task goes", "open tasks go") : "Open tasks (none) go"} back
                  to the team.
                </li>
                <li>• Their working hours here stop offering new booking slots.</li>
              </ul>
            </div>

            {impact.upcomingAppointments > 0 && (
              <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {n(impact.upcomingAppointments, "upcoming appointment is", "upcoming appointments are")} still booked with
                them. Those stay as they are — move them to another doctor from Appointments.
              </p>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">What stays</p>
              <p className="text-muted-foreground">
                Everything they did: past appointments, notes, call outcomes and messages keep their name, so patient
                records stay complete.
              </p>
            </div>

            {impact.canDisableLogin && (
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-3 ${
                  disableLogin ? "border-red-500/50 bg-red-500/5" : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  checked={disableLogin}
                  onChange={(e) => setDisableLogin(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">Also switch off their login</span>
                  <span className="block text-xs text-muted-foreground">
                    They are signed out everywhere and cannot sign in again. The account is kept (not deleted) so their
                    records stay; you can switch it back on later.
                    {impact.otherClinics.length > 0 && (
                      <b className="mt-1 block text-red-600 dark:text-red-400">
                        They also work at {impact.otherClinics.join(", ")} — this stops them there too.
                      </b>
                    )}
                  </span>
                </span>
              </label>
            )}
            {!impact.canDisableLogin && (
              <p className="text-xs text-muted-foreground">
                Their login stays{impact.otherClinics.length > 0 ? ` — they still work at ${impact.otherClinics.join(", ")}` : ""}.
                Only a superadmin can switch a login off.
              </p>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}

        {/* A deliberate step: removing someone is not a click to make by accident. */}
        {(impact || impactFailed) && (
          <div>
            <label htmlFor="confirm-remove" className="mb-1 block text-xs text-muted-foreground">
              Type <b className="font-mono text-foreground">DELETE</b> to confirm
            </label>
            <input
              id="confirm-remove"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && typed === "DELETE" && !busy && confirm()}
              autoComplete="off"
              autoFocus
              placeholder="DELETE"
              className={`${inputClass} font-mono`}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={confirm}
            disabled={busy || (!impact && !impactFailed) || typed !== "DELETE"}
          >
            {busy && <PredictSpinner className="size-4" />}
            {disableLogin ? "Remove and switch off login" : "Remove from clinic"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
