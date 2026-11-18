"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Activity, ArrowRight, CalendarClock, CheckCircle, Clock, Gauge, HeartPulse, Mail, MapPin, Pencil, Phone, Receipt, ShieldCheck, XCircle } from "lucide-react"
import { authClient } from "@/src/lib/auth/auth-client"
import { UserDetails } from "@/src/utils/user"
import { Switch } from "@workspace/ui/components/switch"
import { CarePlanPanel } from "@/src/components/dashboard/care-plan-panel"
import { TherapyPanel } from "@/src/components/dashboard/treatment-plans/therapy-panel"
import { UserPermissionsPanel } from "@/src/components/dashboard/user-permissions-panel"

const STAFF_ROLES_THAT_CAN_UPLOAD = ["admin", "superadmin", "health_coach"]

const PLACEHOLDER_SECTIONS = [
  { key: "billing", label: "Billing", icon: Receipt },
  { key: "biomarkers", label: "Biomarkers", icon: Activity },
  { key: "health-score", label: "Health Score", icon: Gauge },
  { key: "chronological-age", label: "Chronological Age", icon: Clock },
  { key: "biological-age", label: "Biological Age", icon: HeartPulse },
]

const ROLE_LABELS: Record<string, string> = {
  patient: "Patient",
  admin: "Admin",
  doctor: "Doctor",
  health_coach: "Health Coach",
  nutritionist: "Nutritionist",
  superadmin: "Super Admin",
}

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

function MobileNumberField({
  patientId,
  mobileNumber,
  editable,
  onSaved,
}: {
  patientId: string
  mobileNumber: string | null
  editable: boolean
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(mobileNumber ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(mobileNumber ?? "")
  }, [mobileNumber])

  if (!editable) {
    return mobileNumber ? (
      <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
        <div className="flex items-center gap-2 text-sm text-black/65 dark:text-white/45">
          <Phone className="h-4 w-4" />
          <span>Mobile</span>
        </div>
        <span className="text-sm font-medium">{mobileNumber}</span>
      </div>
    ) : null
  }

  if (editing) {
    const handleSave = async () => {
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(`/api/superadmin/users/${patientId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mobileNumber: value }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error ?? "Failed to save")
        }
        setEditing(false)
        onSaved()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save")
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="py-2.5 first:pt-0 last:pb-0">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-black/65 dark:text-white/45" />
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Mobile number"
            className="flex-1 rounded-md border border-black/18 bg-transparent px-2 py-1 text-sm focus:border-black/30 focus:outline-none dark:border-white/10"
          />
          <Button variant="simple" size="sm"
 onClick={handleSave}
 disabled={saving}

 >
            {saving ? <PredictSpinner className="size-4" /> : "Save"}
          </Button>
          <Button variant="ghost" size="sm" className="text-black/65 hover:text-black dark:text-white/40 dark:hover:text-white"
 onClick={() => {
 setEditing(false)
 setValue(mobileNumber ?? "")
 setError(null)
 }}

 >
            Cancel
          </Button>
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2 text-sm text-black/65 dark:text-white/45">
        <Phone className="h-4 w-4" />
        <span>Mobile</span>
      </div>
      <Button variant="ghost" size="default" className="hover:opacity-70"
 onClick={() => setEditing(true)}

 >
        {mobileNumber ?? <span className="text-black/65 dark:text-white/40">Add number</span>}
        <Pencil className="h-3 w-3 text-black/65 dark:text-white/40" />
      </Button>
    </div>
  )
}

// Spans the full grid: the plan is a list that grows, not a tile.
interface UserDetailViewProps {
  id: string
}

export function UserDetailView({ id }: UserDetailViewProps) {
  const { data: viewerSession } = authClient.useSession()
  const [user, setUser] = useState<UserDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  // Non-null while the "why are you banning this account?" prompt is open.
  const [banReason, setBanReason] = useState<string | null>(null)

  const fetchUser = useCallback(() => {
    return fetch(`/api/superadmin/users/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true)
          return
        }
        const data = await res.json()
        setUser(data.user)
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  // Banning asks for a reason first; lifting a ban is a single click.
  function handleToggleStatus() {
    if (!user) return
    if (user.banned) applyStatus(false)
    else setBanReason("")
  }

  async function applyStatus(banned: boolean, reason?: string) {
    if (!user) return
    setTogglingStatus(true)
    setToggleError(null)
    try {
      const res = await fetch(`/api/superadmin/users/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned, banReason: reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to update status")
      setBanReason(null)
      await fetchUser()
    } catch (err: any) {
      setToggleError(err.message || "Failed to update status")
    } finally {
      setTogglingStatus(false)
    }
  }

  const roleKey = (user?.role ?? "patient").toLowerCase()
  const roleLabel = ROLE_LABELS[roleKey] ?? user?.role ?? "Patient"

  const viewerRole = (viewerSession?.user.role ?? "").toLowerCase()
  const canUploadReports =
    roleKey === "patient" && STAFF_ROLES_THAT_CAN_UPLOAD.includes(viewerRole)
  const canToggleStatus =
    (viewerRole === "superadmin" || viewerRole === "admin") && user?.id !== viewerSession?.user.id

  const initials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U"

  const hasAddress = user?.addressLine1 || user?.city || user?.state || user?.pincode
  const hasPatientDetails =
    roleKey === "patient" &&
    Boolean(user?.dateOfBirth || user?.mobileNumber || hasAddress || canUploadReports)

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (notFound || !user) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center text-black/65 dark:text-white/40">
        <ShieldCheck className="h-8 w-8 opacity-20" />
        <span className="text-sm">User not found</span>
        <Link
          href="/dashboard"
          className="mt-2 text-sm font-medium text-black underline dark:text-white"
        >
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 text-black dark:text-white">

      {/* Identity chip */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-black/18 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-black">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-black/5 dark:ring-white/10"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-sm font-semibold text-black ring-2 ring-black/5 dark:bg-white/5 dark:text-white dark:ring-white/10">
            {initials}
          </div>
        )}

        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">{user.name}</span>
          <span className="text-xs text-black/65 dark:text-white/45">{user.email}</span>
          {user.patientCode && (
            <span className="text-xs text-black/65 dark:text-white/35">
              Patient ID: {user.patientCode}
            </span>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-full border border-black bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider dark:border-white dark:bg-white/5">
            {roleLabel}
          </span>

          {user.banned ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-black/20 bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase dark:border-white/20 dark:bg-white/5"
              title={user.banReason ? `Reason: ${user.banReason}` : undefined}
            >
              <XCircle className="h-3 w-3" /> Banned
            </span>
          ) : user.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-black/20 bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase dark:border-white/20 dark:bg-white/5">
              <CheckCircle className="h-3 w-3" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-black/20 bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase dark:border-white/20 dark:bg-white/5">
              <Clock className="h-3 w-3" /> Pending
            </span>
          )}

          {(viewerRole === "superadmin" || viewerRole === "admin") && (
            <Switch
              size="sm"
              checked={!user.banned}
              disabled={togglingStatus || !canToggleStatus}
              onCheckedChange={handleToggleStatus}
              title={
                !canToggleStatus
                  ? "You can't change your own account status"
                  : user.banned
                    ? "Mark active"
                    : "Mark inactive"
              }
            />
          )}
        </div>
      </div>

      {toggleError && (
        <p className="-mt-2 text-xs text-red-500">{toggleError}</p>
      )}

      {banReason !== null && (
        <div className="-mt-2 flex flex-col gap-2 rounded-lg border border-black/18 p-3 dark:border-white/10">
          <label htmlFor="ban-reason" className="text-xs font-medium">
            Why is this account being deactivated?
          </label>
          <input
            id="ban-reason"
            value={banReason}
            autoFocus
            maxLength={500}
            onChange={(e) => setBanReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyStatus(true, banReason)
              if (e.key === "Escape") setBanReason(null)
            }}
            placeholder="Duplicate account, payment dispute, left the programme…"
            className="rounded-md border border-black/18 px-2.5 py-1.5 text-sm focus:border-black/40 focus:outline-none dark:border-white/10 dark:focus:border-white/40"
          />
          <p className="text-[11px] text-black/60 dark:text-white/35">
            They will see this if they try to sign in. The ban stays until someone lifts it.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="hover:bg-black/[0.03] dark:hover:bg-white/5"
 onClick={() => setBanReason(null)}

 >
              Cancel
            </Button>
            <Button variant="simple" size="sm" className="hover:opacity-90"
 onClick={() => applyStatus(true, banReason)}
 disabled={togglingStatus}

 >
              {togglingStatus && <PredictSpinner className="size-4" />}
              Deactivate account
            </Button>
          </div>
        </div>
      )}

      {user.banned && user.banReason && banReason === null && (
        <p className="-mt-2 text-xs text-black/65 dark:text-white/45">
          Deactivated — {user.banReason}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {/* Account + Patient details */}
          <div className={`grid gap-4 ${hasPatientDetails ? "sm:grid-cols-2" : ""}`}>
            <div className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
                Account Details
              </p>

              <div className="mt-3 divide-y divide-black/18 dark:divide-white/10">
                <div className="flex items-center justify-between py-2.5 first:pt-0">
                  <div className="flex items-center gap-2 text-sm text-black/65 dark:text-white/45">
                    <Mail className="h-4 w-4" />
                    <span>Email</span>
                  </div>
                  <span className="text-sm font-medium">{user.email}</span>
                </div>

                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-black/65 dark:text-white/45">Joined</span>
                  <span className="text-sm font-medium">{timeAgo(user.createdAt)}</span>
                </div>

                <div className="flex items-center justify-between py-2.5 last:pb-0">
                  <span className="text-sm text-black/65 dark:text-white/45">Last Sign In</span>
                  <span className="text-sm font-medium">{timeAgo(user.lastSignIn)}</span>
                </div>

                {user.accounts.length > 0 && (
                  <div className="flex items-center justify-between py-2.5 last:pb-0">
                    <span className="text-sm text-black/65 dark:text-white/45">
                      Linked Accounts
                    </span>
                    <span className="text-sm font-medium capitalize">
                      {user.accounts.join(", ")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {hasPatientDetails && (
              <div className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
                  Patient Details
                </p>

                <div className="mt-3 divide-y divide-black/18 dark:divide-white/10">
                  {user.dateOfBirth && (
                    <div className="flex items-center justify-between py-2.5 first:pt-0">
                      <span className="text-sm text-black/65 dark:text-white/45">
                        Date of Birth
                      </span>
                      <span className="text-sm font-medium">{user.dateOfBirth}</span>
                    </div>
                  )}

                  {user.gender && (
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-sm text-black/65 dark:text-white/45">Gender</span>
                      <span className="text-sm font-medium capitalize">
                        {user.gender.toLowerCase()}
                      </span>
                    </div>
                  )}

                  {user.bloodGroup && (
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-sm text-black/65 dark:text-white/45">Blood Group</span>
                      <span className="text-sm font-medium">{user.bloodGroup}</span>
                    </div>
                  )}

                  <MobileNumberField
                    patientId={user.id}
                    mobileNumber={user.mobileNumber}
                    editable={canUploadReports}
                    onSaved={fetchUser}
                  />

                  {hasAddress && (
                    <div className="flex items-start justify-between py-2.5 last:pb-0">
                      <div className="flex items-center gap-2 text-sm text-black/65 dark:text-white/45">
                        <MapPin className="h-4 w-4" />
                        <span>Address</span>
                      </div>
                      <span className="max-w-[60%] text-right text-sm font-medium">
                        {[user.addressLine1, user.city, user.state, user.pincode]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {roleKey !== "patient" && (
            <UserPermissionsPanel userId={user.id} />
          )}

          {/* Clinical sections */}
          {roleKey === "patient" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* The course they bought, above what they were prescribed:
                  the sittings are the commitment, the care plan hangs off it. */}
              <div className="sm:col-span-2 lg:col-span-3">
                <TherapyPanel userId={user.id} />
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <CarePlanPanel userId={user.id} />
              </div>

              <Link
                href={`/people/${user.id}/appointments`}
                className="group rounded-md border border-black/18 bg-white p-4 shadow-sm transition hover:bg-black/[0.02] dark:border-white/10 dark:bg-black dark:hover:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Appointments
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-black/30 transition group-hover:translate-x-0.5 group-hover:text-black/60 dark:text-white/30 dark:group-hover:text-white/60" />
                </div>
                <p className="mt-2.5 text-sm text-black/65 dark:text-white/40">
                  Book a visit, view history, upload reports
                </p>
              </Link>

              {PLACEHOLDER_SECTIONS.map(({ key, label, icon: Icon }) => (
                <div
                  key={key}
                  className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black"
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </div>
                  <p className="mt-2.5 text-sm text-black/65 dark:text-white/40">
                    Coming soon
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  )
}
