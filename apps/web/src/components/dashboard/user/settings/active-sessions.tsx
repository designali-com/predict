"use client"

import { useCallback, useEffect, useState } from "react"
import { Laptop, Loader2, LogOut, Smartphone } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { authClient } from "@/src/lib/auth/auth-client"
import { PredictSpinner } from "@/src/components/predict-loader"

interface SessionRow {
  id: string
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  createdAt: string | Date
  updatedAt: string | Date
}

/** "Chrome on Windows" from a user-agent string — enough to recognise a device. */
function describe(ua: string | null | undefined): { label: string; mobile: boolean } {
  // Sessions made before sign-in passed its headers through have no browser
  // on record; say that, rather than "Unknown device", which reads as alarming.
  if (!ua) return { label: "Earlier sign-in — device not recorded", mobile: false }
  // Order matters: Chrome's string also says "Safari", and the iPhone builds of
  // Chrome, Firefox and Edge carry their own tokens rather than the desktop ones.
  const browser = /Edg\/|EdgiOS\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\/|CriOS\//.test(ua)
        ? "Chrome"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser"
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iPhone"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "another device"
  return { label: `${browser} on ${os}`, mobile: /Android|iPhone|iPad|Mobile/.test(ua) }
}

/**
 * An address worth showing, or null. The unspecified and loopback addresses
 * ("::", "::1", 127.0.0.1) are what a local server records, not where anybody
 * is — printed out they read as 0000:0000:… and mean nothing.
 */
function displayIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const v = ip.trim().replace(/^::ffff:/i, "")
  if (v.startsWith("127.") || v === "0.0.0.0") return null
  if (v.includes(":")) {
    // IPv6: with the colons and zeros taken out, "::" leaves nothing and "::1" leaves "1".
    const digits = v.replace(/[:0]/g, "")
    if (digits === "" || digits === "1") return null
  }
  return v
}

function when(value: string | Date) {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * Where this account is signed in — the real sessions, from the auth server.
 *
 * Replaced a hard-coded "Chrome on macOS · New Delhi" and a sign-out button
 * that did nothing. Each other device can be signed out on its own, or all of
 * them at once; this one is marked and left alone.
 */
export function ActiveSessions() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null)
  const [currentToken, setCurrentToken] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const [list, current] = await Promise.all([authClient.listSessions(), authClient.getSession()])
    if (list.error) {
      setError("Could not load your sessions.")
      setSessions([])
      return
    }
    setCurrentToken(current.data?.session.token ?? null)
    const rows = (list.data ?? []) as SessionRow[]
    setSessions(rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const signOut = async (token: string) => {
    setBusy(token)
    const res = await authClient.revokeSession({ token })
    if (res.error) setError("Could not sign that device out.")
    await load()
    setBusy(null)
  }

  const signOutOthers = async () => {
    setBusy("others")
    const res = await authClient.revokeOtherSessions()
    if (res.error) setError("Could not sign the other devices out.")
    await load()
    setBusy(null)
  }

  if (!sessions) {
    return (
      <div className="flex justify-center py-10">
        <PredictSpinner />
      </div>
    )
  }

  const others = sessions.filter((s) => s.token !== currentToken)

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {sessions.map((s) => {
        const isCurrent = s.token === currentToken
        // The stored user-agent is the one at sign-in. For this device, the
        // browser actually showing the page is the truer answer — signing in
        // with the dev tools' phone mode on recorded "Safari on iPhone" for a
        // desktop Chrome window.
        const device = describe(isCurrent && typeof navigator !== "undefined" ? navigator.userAgent : s.userAgent)
        const ip = displayIp(s.ipAddress)
        const Icon = device.mobile ? Smartphone : Laptop
        return (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{device.label}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  Signed in {when(s.createdAt)}
                  {ip ? ` · ${ip}` : ""}
                </p>
              </div>
            </div>
            {isCurrent ? (
              <Badge variant="secondary" className="shrink-0 rounded-md text-[10px] font-semibold uppercase tracking-wider">
                This device
              </Badge>
            ) : (
              <Button
 variant="outline"
 size="sm"
 className="h-7 shrink-0 px-2.5 text-xs"
 disabled={busy !== null}
 onClick={() => signOut(s.token)}
 >
                {busy === s.token ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <LogOut className="mr-1.5 size-3.5" />}
                Sign out
              </Button>
            )}
          </div>
        )
      })}

      {others.length > 0 && (
        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" className=" text-xs" disabled={busy !== null} onClick={signOutOthers}>
            {busy === "others" ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <LogOut className="mr-1.5 size-3.5" />}
            Sign out all other devices
          </Button>
        </div>
      )}
    </div>
  )
}
