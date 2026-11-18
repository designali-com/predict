"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, KeyRound, ShieldCheck, Info, RotateCcw } from "lucide-react"
import { PermissionTable, type PermissionRow } from "./permission-table"

interface State {
  permission: string
  fromRole: boolean
  override: boolean | null
  effective: boolean
}

interface RoleOption {
  key: string
  label: string
  panel: string
}

/**
 * One person's role, and the pages that role opens for them.
 *
 * Only the panels their role actually works in are listed — a doctor's list
 * has no business containing lead-nurture flows, which they cannot reach and
 * which only make the rows that matter harder to find.
 *
 * The switch shows what applies to this person. Their role supplies the
 * starting position; flipping one pins it for them alone, so two doctors at
 * the same clinic can differ. "Reset to role" puts every row back to following
 * the role again, including as the role later changes.
 */
export function UserPermissionsPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<PermissionRow[]>([])
  const [states, setStates] = useState<State[]>([])
  const [unrestricted, setUnrestricted] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [changingRole, setChangingRole] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [settingPassword, setSettingPassword] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/superadmin/user-permissions?userId=${userId}`)
    const data = await res.json().catch(() => null)
    setRows(data?.permissions ?? [])
    setStates(data?.states ?? [])
    setUnrestricted(data?.unrestricted ?? false)
    setRole(data?.user?.role ?? null)
  }, [userId])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    fetch("/api/superadmin/role-options")
      .then((r) => r.json())
      .then((d) => setRoleOptions(d?.roles ?? []))
      .catch(() => setRoleOptions([]))
  }, [])

  const byKey = useMemo(() => new Map(states.map((s) => [s.permission, s])), [states])
  const overrides = useMemo(() => states.filter((s) => s.override !== null), [states])

  const send = async (permission: string, override: boolean | null) => {
    setError(null)
    const res = await fetch("/api/superadmin/user-permissions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, permission, override }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error ?? "Could not update")
      return false
    }
    setStates(data.states ?? [])
    return true
  }

  const toggle = async (permission: string, next: boolean) => {
    setBusy(permission)
    try {
      await send(permission, next)
    } finally {
      setBusy(null)
    }
  }

  const resetToRole = async () => {
    setResetting(true)
    try {
      for (const s of overrides) {
        if (!(await send(s.permission, null))) break
      }
    } finally {
      setResetting(false)
    }
  }

  const changeRole = async (next: string) => {
    setChangingRole(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/superadmin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: next }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not change the role")
        return
      }
      if (data?.overridesCleared) {
        setNotice("Role changed. Their pages now follow the new role's defaults.")
      }
      await load()
    } finally {
      setChangingRole(false)
    }
  }

  async function setNewPassword(e: React.FormEvent) {
    e.preventDefault()
    setSettingPassword(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/superadmin/users/${userId}/password`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not set the password")
        return
      }
      setPassword("")
      setNotice("Password set. Tell them the new one — it cannot be read back.")
    } finally {
      setSettingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center rounded-md border border-black/18 py-8 dark:border-white/10">
        <PredictSpinner className="size-5" />
      </div>
    )
  }

  const current = roleOptions.find((r) => r.key === role)
  const roleName = current?.label ?? role?.replace(/_/g, " ") ?? "role"

  return (
    <div className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
          <ShieldCheck className="h-3.5 w-3.5" />
          Role and access
        </div>
        {!unrestricted && overrides.length > 0 && (
          <Button variant="ghost" size="sm" className="text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
 onClick={resetToRole}
 disabled={resetting}

 >
            {resetting ? (
              <PredictSpinner className="size-4" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Reset to {roleName} defaults
          </Button>
        )}
      </div>

      {/* Which role — moving someone is a role change, not thirty toggles. */}
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-black/18 p-3 dark:border-white/10">
        <label className="min-w-[200px]">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
            Role
          </span>
          <select
            value={role ?? ""}
            disabled={changingRole || roleOptions.length === 0}
            onChange={(e) => changeRole(e.target.value)}
            className="w-full rounded-md border border-black/18 bg-white px-3 py-2 text-sm outline-none focus:border-black/30 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:focus:border-white/30"
          >
            {!current && role && <option value={role}>{role}</option>}
            {roleOptions.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {changingRole && <PredictSpinner className="size-4" />}
        <p className="mb-1 flex-1 text-xs text-black/60 dark:text-white/40">
          Changing this replaces the pages below with the new role&apos;s defaults and clears
          anything set for this person alone.
        </p>
      </div>

      {/* A forgotten password had no answer short of deleting the account and
          making it again. Accounts are created here with a password chosen by
          whoever created them, so the person using it often never knew it. */}
      <form
        onSubmit={setNewPassword}
        className="mb-3 flex flex-wrap items-end gap-3 rounded-md border border-black/18 p-3 dark:border-white/10"
      >
        <label className="min-w-[220px] flex-1">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
            <KeyRound className="h-3.5 w-3.5" />
            Set a new password
          </span>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="off"
            className="w-full rounded-md border border-black/18 bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-black dark:focus:border-white/30"
          />
        </label>
        <Button variant="simple" size="default" className="mb-0.5"
 type="submit"
 disabled={settingPassword || password.trim().length < 8}

 >
          {settingPassword ? (
            <PredictSpinner className="size-4" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Set
        </Button>
        <p className="w-full text-xs text-black/60 dark:text-white/40">
          Shown in plain text on purpose — you have to be able to read it out. The existing one
          cannot be recovered, only replaced.
        </p>
      </form>

      {notice && <p className="mb-2 text-xs text-black/65 dark:text-white/50">{notice}</p>}
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {unrestricted ? (
        <div className="flex items-start gap-2 rounded-md border border-black/18 p-3 text-sm dark:border-white/10">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-black/65 dark:text-white/40" />
          <p className="text-black/60 dark:text-white/60">
            Superadmin opens everything and bypasses these tables entirely — there is nothing here
            to change. That is what stops a mis-click removing the ability to undo the mis-click.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-black/65 dark:text-white/40">
            {overrides.length === 0
              ? `Everything follows the ${roleName} role. Flip a switch to change it for this person only.`
              : `${overrides.length} page${overrides.length === 1 ? "" : "s"} differ${overrides.length === 1 ? "s" : ""} from the ${roleName} role.`}
          </p>

          <PermissionTable
            rows={rows}
            isOn={(key) => byKey.get(key)?.effective ?? false}
            busyKey={busy}
            disabled={resetting || changingRole}
            onToggle={toggle}
          />
        </>
      )}
    </div>
  )
}
