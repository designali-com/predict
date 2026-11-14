"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Mail,
  MessageCircle,
  Power,
  UserPlus,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"
import { PATIENT_APP_CHANGED } from "./predict-referral-panel"

interface Status {
  setup: {
    hasMobile: boolean
    hasLogin: boolean
    readingCount: number
    hasBiologicalAge: boolean
    ready: boolean
  } | null
  hasLogin: boolean
  login: {
    phone: string | null
    email: string | null
    disabled: boolean
    createdAt: string
    lastSignInAt: string | null
  } | null
  days: number
  whatsappTemplate: string
  email: string | null
  link: { createdAt: string; expiresAt: string; lastUsedAt: string | null; useCount: number } | null
  /** False at a clinic without Diagnosis: no new logins, the app comes with a referral to Predict. */
  appOffered: boolean
}

type Busy = "load" | "create" | "whatsapp" | "email" | "copy" | "preview" | "revoke" | "access" | null

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

const phoneText = (p: string | null) => (p ? p.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "") : "—")

/**
 * The patient's app, handed over in steps.
 *
 *   1. Create login — from the chart's mobile, no password. Never done at
 *      registration: being registered is not the same as getting the app.
 *   2. Send the sign-in link — on WhatsApp (the approved "results ready"
 *      template), by email, or copied. Opening it opens their dashboard.
 *
 * Then the rest of looking after it: view the dashboard as they see it, revoke
 * a link sent to the wrong place, switch access off and on.
 */
export function LoginLinkPanel({ patientId }: { patientId: string; patientName?: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState<Busy>("load")
  const [error, setError] = useState("")
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/patients/${patientId}/login-link`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not load app access")
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load app access")
    } finally {
      setBusy(null)
    }
  }, [patientId])

  useEffect(() => {
    load()
  }, [load])

  // A referral to Predict makes the login; show it without a reload.
  useEffect(() => {
    window.addEventListener(PATIENT_APP_CHANGED, load)
    return () => window.removeEventListener(PATIENT_APP_CHANGED, load)
  }, [load])

  async function call(kind: Exclude<Busy, "load" | null>, body: Record<string, unknown> | null, method = "POST") {
    setBusy(kind)
    setError("")
    try {
      const res = await fetch(`/api/staff/patients/${patientId}/login-link`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (data.error) setError(data.error)
      if (!res.ok && !data.url) throw new Error(data.error || "That did not work")
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work")
      return null
    } finally {
      await load()
    }
  }

  const sendLink = async (via: "whatsapp" | "email" | "copy") => {
    if (status?.link && !confirm("This makes a new link — the one sent before stops working. Continue?")) return
    if (status?.setup && !status.setup.ready && !confirm("Their dashboard is still empty — the blood report isn't confirmed yet. Send the link anyway?")) return
    const data = await call(via, { action: "link", via })
    if (!data?.url) return
    if (via === "whatsapp" && data.sentVia) toast.success("Sign-in link sent on WhatsApp")
    if (via === "email" && data.sentVia) toast.success(`Sign-in link emailed to ${data.to}`)
    if (via === "copy") {
      setCopiedUrl(data.url)
      try {
        await navigator.clipboard.writeText(data.url)
        toast.success("Link copied — send it to the patient's own number")
      } catch {
        toast.success("Link made — copy it from below")
      }
    }
  }

  const preview = async () => {
    // Opened before the request so the browser does not block it as a pop-up.
    const tab = window.open("about:blank", "_blank")
    const data = await call("preview", { action: "preview" })
    if (data?.url && tab) tab.location.href = data.url
    else tab?.close()
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-black/18 p-4 text-xs text-muted-foreground dark:border-white/12">
        {busy === "load" ? <PredictSpinner className="size-4" /> : <AlertCircle className="h-4 w-4" />}
        {busy === "load" ? "Loading app access…" : error}
      </div>
    )
  }

  const login = status.login
  // Nothing to manage and nothing this clinic can start.
  if (!login && status.appOffered === false) return null
  const templateOk = status.whatsappTemplate === "approved"
  const setup = status.setup
  const steps = setup
    ? [
        { done: setup.hasMobile, label: "Mobile number on the chart" },
        {
          done: setup.readingCount > 0,
          label: setup.readingCount > 0 ? `Blood values confirmed (${setup.readingCount})` : "Blood report uploaded and values confirmed",
        },
        { done: setup.hasBiologicalAge, label: "Biological age worked out" },
      ]
    : []

  return (
    <div className="rounded-md border border-black/18 p-4 dark:border-white/12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-black/55 dark:text-white/40">
          <Link2 className="h-3.5 w-3.5" /> Patient app access
        </p>
        {/* No login yet: the one thing to do, on the title row. */}
        {!login && (
        <Button
          size="sm"
          disabled={busy !== null || !setup?.hasMobile}
          title={!setup?.hasMobile ? "Add a mobile number to the chart first" : undefined}
          onClick={async () => {
            const data = await call("create", { action: "create" })
            if (data?.ok) toast.success("Login created — now send them the sign-in link")
          }}
        >
          {busy === "create" ? <PredictSpinner className="size-4" /> : <UserPlus className="h-3.5 w-3.5" />}
          Create login
        </Button>
        )}
        {login && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              login.disabled
                ? "bg-red-500/10 text-red-700 dark:text-red-400"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {login.disabled ? "Access off" : "Access on"}
          </span>
        )}
      </div>

      {/* ---------------------------------------------------------- step 1 */}
      {!login ? null : (
        <>
          {/* -------------------------------------------------- the login */}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <dt className="text-black/50 dark:text-white/40">Signs in with</dt>
              <dd className="font-medium">{phoneText(login.phone)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-black/50 dark:text-white/40">Email</dt>
              <dd className="truncate font-medium">{login.email ?? status.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-black/50 dark:text-white/40">Login created</dt>
              <dd className="font-medium">{when(login.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-black/50 dark:text-white/40">Last signed in</dt>
              <dd className="font-medium">{login.lastSignInAt ? when(login.lastSignInAt) : "Never"}</dd>
            </div>
          </dl>

          {!login.disabled && (
            <>
              {/* ---------------------------------------- step 2: the link */}
              <div className="mt-4 border-t border-black/10 pt-3 dark:border-white/10">
                <p className="text-xs font-semibold">Send the sign-in link</p>
                <p className="mt-0.5 text-[11px] text-black/55 dark:text-white/45">
                  {status.link
                    ? `Live link until ${when(status.link.expiresAt)} · ${
                        status.link.useCount
                          ? `opened ${status.link.useCount}×, last ${when(status.link.lastUsedAt!)}`
                          : "not opened yet"
                      }`
                    : `Opens their dashboard, no password. Works for ${status.days} days.`}
                </p>

                {setup && !setup.ready && (
                  <ul className="mt-2 space-y-1">
                    {steps.map((s) => (
                      <li key={s.label} className="flex items-center gap-2 text-[11px]">
                        {s.done ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 shrink-0 text-black/30 dark:text-white/30" />
                        )}
                        <span className={s.done ? "text-black/60 dark:text-white/50" : "font-medium"}>{s.label}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null || !templateOk}
                    title={!templateOk ? `The WhatsApp template isn't approved yet (${status.whatsappTemplate})` : undefined}
                    onClick={() => sendLink("whatsapp")}
                  >
                    {busy === "whatsapp" ? <PredictSpinner className="size-4" /> : <MessageCircle className="h-3.5 w-3.5" />}
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null || !status.email}
                    title={!status.email ? "No email address on file" : `To ${status.email}`}
                    onClick={() => sendLink("email")}
                  >
                    {busy === "email" ? <PredictSpinner className="size-4" /> : <Mail className="h-3.5 w-3.5" />}
                    Email
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => sendLink("copy")}>
                    {busy === "copy" ? <PredictSpinner className="size-4" /> : <Copy className="h-3.5 w-3.5" />}
                    Copy link
                  </Button>
                </div>
                {copiedUrl && (
                  <p className="mt-2 break-all rounded bg-black/5 px-2.5 py-2 font-mono text-[11px] dark:bg-white/5">{copiedUrl}</p>
                )}
              </div>
            </>
          )}

          {/* ------------------------------------------------ more options */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-black/10 pt-3 dark:border-white/10">
            {!login.disabled && (
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={preview} title="Opens their dashboard in a new tab, signed in as them, for 10 minutes">
                {busy === "preview" ? <PredictSpinner className="size-4" /> : <ExternalLink className="h-3.5 w-3.5" />}
                View dashboard
              </Button>
            )}
            {status.link && !login.disabled && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={async () => {
                  if (!confirm("Revoke this link? Opening it will go to the login page instead.")) return
                  setCopiedUrl(null)
                  const data = await call("revoke", null, "DELETE")
                  if (data?.ok) toast.success("Link revoked")
                }}
              >
                {busy === "revoke" ? <PredictSpinner className="size-4" /> : <KeyRound className="h-3.5 w-3.5" />}
                Revoke link
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className={login.disabled ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
              disabled={busy !== null}
              onClick={async () => {
                const off = !login.disabled
                if (off && !confirm("Switch app access off? They are signed out everywhere and cannot sign in until it is switched back on. Nothing of theirs is deleted.")) return
                const data = await call("access", { action: off ? "disable" : "enable" })
                if (data?.ok) toast.success(off ? "App access switched off" : "App access switched on")
              }}
            >
              {busy === "access" ? (
                <PredictSpinner className="size-4" />
              ) : login.disabled ? (
                <Power className="h-3.5 w-3.5" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
              {login.disabled ? "Switch access on" : "Switch access off"}
            </Button>
          </div>
        </>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-500">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
