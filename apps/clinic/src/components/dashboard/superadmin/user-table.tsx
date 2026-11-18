"use client"

import { Button } from "@workspace/ui/components/button"

import { useState } from "react"
import Link from "next/link"
import { UserWithDetails } from "@/src/utils/user"
import { authClient } from "@/src/lib/auth/auth-client"
import { CheckCircle, XCircle, Clock, ShieldCheck, Eye, Trash2 } from "lucide-react"
import { DeleteUserModal } from "./delete-user-modal"

function timeAgo(date: Date | string | null): string {
  if (!date) return "Never"
  const now = Date.now()
  const d = new Date(date).getTime()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`
  return `${Math.floor(diff / 31536000)}y ago`
}

interface UserTableProps {
  users: UserWithDetails[]
  isLoading?: boolean
  onUserDeleted?: () => void
  /**
   * Show which role each person holds. Off for the single-role lists, where
   * every row would repeat the page title; on for Team, where the mix is the
   * whole reason the list exists.
   */
  showRole?: boolean
  /** key -> display name, so a renamed role reads correctly here too. */
  roleLabels?: Record<string, string>
}

function StatusBadge({ verified, banned }: { verified: boolean; banned: boolean }) {
  if (banned) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-black/20 bg-black/5 px-2.5 py-0.5 text-[10px] font-semibold text-black uppercase dark:border-white/20 dark:bg-white/5 dark:text-white">
        <XCircle className="h-3 w-3" /> Banned
      </span>
    )
  }
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-black/20 bg-black/5 px-2.5 py-0.5 text-[10px] font-semibold text-black uppercase dark:border-white/20 dark:bg-white/5 dark:text-white">
        <CheckCircle className="h-3 w-3" /> Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/20 bg-black/5 px-2.5 py-0.5 text-[10px] font-semibold text-black uppercase dark:border-white/20 dark:bg-white/5 dark:text-white">
      <Clock className="h-3 w-3" /> Pending
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-black/12 dark:border-white/5">
      {[...Array(5)].map((_, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-4 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
        </td>
      ))}
    </tr>
  )
}

function AvatarFallback({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-8 w-8 rounded-full object-cover"
      />
    )
  }
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const surface = name.charCodeAt(0) % 2 === 0 ? "bg-black text-white dark:bg-white dark:text-black" : "bg-black/10 text-black dark:bg-white/10 dark:text-white"

  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-black/18 text-[11px] font-bold ${surface} dark:border-white/10`}
    >
      {initials}
    </div>
  )
}

export function UserTable({
  users,
  isLoading = false,
  onUserDeleted,
  showRole = false,
  roleLabels = {},
}: UserTableProps) {
  const { data: viewerSession } = authClient.useSession()
  const viewerRole = (viewerSession?.user.role ?? "").toLowerCase()
  const isSuperadmin = viewerRole === "superadmin"
  const viewerId = viewerSession?.user.id

  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null)

  return (
    <div className="overflow-hidden rounded-md border border-black/20 bg-white dark:border-white/20 dark:bg-black">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-black dark:text-white">
          <thead>
            <tr className="border-b border-black/20 dark:border-white/20">
              <th className="px-4 py-3.5 text-left text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/60">
                User
              </th>
              {showRole && (
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/60">
                  Role
                </th>
              )}
              <th className="px-4 py-3.5 text-left text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/60">
                Status
              </th>
              <th className="px-4 py-3.5 text-left text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/60">
                Joined
              </th>
              <th className="px-4 py-3.5 text-left text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/60">
                Last Sign In
              </th>
              <th className="px-4 py-3.5 text-right text-[11px] font-semibold tracking-widest text-black/60 uppercase dark:text-white/60">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={showRole ? 6 : 5} className="py-16 text-center text-black/65 dark:text-white/40">
                  <div className="flex flex-col items-center gap-3">
                    <ShieldCheck className="h-8 w-8 opacity-20" />
                    <span className="text-sm">No users found</span>
                  </div>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-black/18 transition-colors duration-150 last:border-0 hover:bg-black/[0.02] dark:border-white/10 dark:hover:bg-white/[0.02]"
                >
                  {/* User info */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <AvatarFallback name={user.name} avatarUrl={user.avatarUrl} />
                      <div className="flex flex-col">
                        <span className="font-medium text-black dark:text-white">{user.name}</span>
                        <span className="text-[11px] text-black/65 dark:text-white/45">{user.email}</span>
                      </div>
                    </div>
                  </td>

                  {showRole && (
                    <td className="px-4 py-3.5">
                      <span className="inline-flex rounded-full border border-black/22 px-2.5 py-0.5 text-[11px] font-medium text-black/70 dark:border-white/15 dark:text-white/70">
                        {roleLabels[(user.role ?? "").toLowerCase()] ?? user.role ?? "—"}
                      </span>
                    </td>
                  )}

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <StatusBadge verified={user.verified} banned={user.banned} />
                  </td>

                  {/* Joined */}
                  <td className="px-4 py-3.5 text-[13px] text-black/60 dark:text-white/40">
                    {timeAgo(user.createdAt)}
                  </td>

                  {/* Last sign in */}
                  <td className="px-4 py-3.5 text-[13px] text-black/60 dark:text-white/40">
                    {timeAgo(user.lastSignIn)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/people/${user.id}`}
                        title="View Details"
                        aria-label="View Details"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/22 text-black transition hover:bg-black/5 dark:border-white/15 dark:text-white dark:hover:bg-white/5"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      {isSuperadmin && (
                        <Button variant="destructive" size="icon-sm" className="border disabled:hover:bg-transparent"
 type="button"
 title={user.id === viewerId ? "You can't delete your own account" : "Delete"}
 aria-label="Delete"
 disabled={user.id === viewerId}
 onClick={() => setUserToDelete({ id: user.id, name: user.name })}

 >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DeleteUserModal
        open={!!userToDelete}
        userId={userToDelete?.id ?? null}
        userName={userToDelete?.name ?? null}
        onClose={() => setUserToDelete(null)}
        onSuccess={() => onUserDeleted?.()}
      />
    </div>
  )
}
