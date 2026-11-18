"use client"

import { Button } from "@workspace/ui/components/button"

import { useState, useEffect, useCallback } from "react"
import { Plus, Search, RefreshCw, Users } from "lucide-react"
import { UserTable } from "./user-table"
import { AddUserModal } from "./add-user-modal"
import { StatsCard } from "./stats-card"
import { UserWithDetails } from "@/src/utils/user"

interface UserPageShellProps {
  role: string
  title: string
  description: string
  roleLabel: string
  icon: React.ReactNode
  accentColor?: string
  canCreate?: boolean
  usersApiPath?: string
}

export function UserPageShell({
  role,
  title,
  roleLabel,
  accentColor = "purple",
  canCreate = true,
  usersApiPath = "/api/superadmin/users",
}: UserPageShellProps) {
  const [users, setUsers] = useState<UserWithDetails[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ role, limit: "50" })
      if (debouncedSearch) {
        params.set("name", debouncedSearch)
      }
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
  }, [role, debouncedSearch, usersApiPath])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const verifiedCount = users.filter((u) => u.verified && !u.banned).length
  const pendingCount = users.filter((u) => !u.verified && !u.banned).length
  const bannedCount = users.filter((u) => u.banned).length

  return (
    <div className="flex flex-col gap-4 p-4 text-black dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-black dark:text-white">{title}</h1>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
          <div className="relative w-full min-w-[200px] sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/65 dark:text-white/40" />
            <input
              type="text"
              placeholder={`Search ${roleLabel.toLowerCase()}s by name…`}
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
              Add {roleLabel}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatsCard
          label="Total"
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

      {/* User Table */}
      <UserTable users={users} isLoading={isLoading} onUserDeleted={fetchUsers} />

      {/* Add User Modal */}
      {canCreate && (
        <AddUserModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={fetchUsers}
          defaultRole={role}
          roleLabel={roleLabel}
        />
      )}
    </div>
  )
}
