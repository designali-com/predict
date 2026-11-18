"use client"

import { Button } from "@workspace/ui/components/button"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, RefreshCw, Search, Users } from "lucide-react"
import { UserTable } from "./user-table"
import { AddUserModal } from "./add-user-modal"
import { StatsCard } from "./stats-card"
import { UserWithDetails } from "@/src/utils/user"

interface RoleOption {
  key: string
  label: string
  panel: string
}

/**
 * Everyone who works here, in one place.
 *
 * This replaces a page per role — Doctors, Nutritionists, Health Coaches,
 * Admins — which were the same fifteen lines four times over and, worse, meant
 * a role created from the Roles page had nowhere to appear until someone
 * shipped a fifth copy. The filter is built from the role catalogue, so a new
 * role shows up here the moment it exists.
 *
 * Patients stay on their own page: thousands of rows rather than dozens, with
 * different columns and a different job attached to them.
 */
export function TeamPageShell({
  usersApiPath = "/api/superadmin/users",
  canCreate = true,
  initialRole = "",
}: {
  usersApiPath?: string
  canCreate?: boolean
  /** Preselected filter, so a link can point at one role's people. */
  initialRole?: string
}) {
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [activeRole, setActiveRole] = useState<string>(initialRole)
  const [users, setUsers] = useState<UserWithDetails[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    fetch("/api/superadmin/role-options")
      .then((r) => r.json())
      .then((d) => setRoles(d?.roles ?? []))
      .catch(() => setRoles([]))
  }, [])

  const staffKeys = useMemo(() => roles.map((r) => r.key).join(","), [roles])
  const roleLabels = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.key, r.label])),
    [roles],
  )

  const fetchUsers = useCallback(async () => {
    if (!staffKeys) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ limit: "50" })
      // Filtering by role happens in the query, not on the rows already
      // fetched — a page holds fifty people and a client-side filter would
      // quietly lose everyone after that.
      if (activeRole) params.set("role", activeRole)
      else params.set("roles", staffKeys)
      if (debouncedSearch) params.set("name", debouncedSearch)

      const res = await fetch(`${usersApiPath}?${params}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setUsers(data.users ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setUsers([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [activeRole, staffKeys, debouncedSearch, usersApiPath])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const roleLabel = useMemo(
    () => roles.find((r) => r.key === activeRole)?.label ?? "",
    [roles, activeRole],
  )

  const verifiedCount = users.filter((u) => u.verified && !u.banned).length
  const pendingCount = users.filter((u) => !u.verified && !u.banned).length
  const bannedCount = users.filter((u) => u.banned).length

  return (
    <div className="flex flex-col gap-4 p-4 text-black dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Team</h1>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
          <div className="relative w-full min-w-[200px] sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/65 dark:text-white/40" />
            <input
              type="text"
              placeholder={roleLabel ? `Search ${roleLabel.toLowerCase()}s by name…` : "Search by name…"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-black/18 bg-white py-2 pl-9 pr-3 text-sm text-black placeholder-black/40 outline-none transition focus:border-black/30 dark:border-white/10 dark:bg-black dark:text-white dark:placeholder-white/40 dark:focus:border-white/30"
            />
          </div>
          <Button variant="outline" size="icon" className="bg-white text-black/60 hover:bg-black/5 dark:bg-black dark:text-white/70 dark:hover:bg-white/5"
 onClick={fetchUsers}
 title="Refresh"
 >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          {canCreate && (
            <Button variant="simple" size="lg" className="active:scale-95"
 onClick={() => setModalOpen(true)}
 >
              <Plus className="h-4 w-4" />
              Add member
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatsCard
          label={roleLabel ? roleLabel : "Total"}
          value={total}
          icon={<Users className="h-4 w-4" />}
          accentColor="#a855f7"
        />
        <StatsCard
          label="Active"
          value={verifiedCount}
          icon={<span className="text-base">✓</span>}
          trend="up"
          accentColor="#10b981"
        />
        <StatsCard
          label="Pending"
          value={pendingCount}
          icon={<span className="text-base">⏳</span>}
          trend="neutral"
          accentColor="#f59e0b"
        />
        <StatsCard
          label="Banned"
          value={bannedCount}
          icon={<span className="text-base">⛔</span>}
          trend={bannedCount > 0 ? "down" : "neutral"}
          accentColor="#ef4444"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <RoleChip label="Everyone" active={!activeRole} onClick={() => setActiveRole("")} />
        {roles.map((r) => (
          <RoleChip
            key={r.key}
            label={r.label}
            active={activeRole === r.key}
            onClick={() => setActiveRole(r.key)}
          />
        ))}
      </div>

      <UserTable
        users={users}
        isLoading={isLoading}
        onUserDeleted={fetchUsers}
        showRole
        roleLabels={roleLabels}
      />

      {canCreate && (
        <AddUserModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={fetchUsers}
          defaultRole={activeRole || roles[0]?.key || ""}
          roleLabel="member"
          roleOptions={roles}
        />
      )}
    </div>
  )
}

function RoleChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button variant="ghost" size="default"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium transition-colors ${
 active
 ?"bg-black text-white dark:bg-white dark:text-black"
 :"border border-black/18 text-black/60 hover:border-black/30 dark:border-white/10 dark:text-white/60"
 }`}
    >
      {label}
    </Button>
  )
}
