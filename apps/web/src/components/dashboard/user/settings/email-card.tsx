"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, Mail } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

/**
 * The account's email, as one row of the sign-in card: what it is now, and a
 * Change (or Add) button that opens the box only when asked. Patients
 * registered at the clinic by mobile have none, and cannot sign in with email
 * until they add one here.
 */
export function EmailCard() {
  const [current, setCurrent] = useState<string | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/patient/profile/email")
      .then((res) => (res.ok ? res.json() : { email: null }))
      .then((data) => setCurrent(data.email ?? null))
      .catch(() => setCurrent(null))
  }, [])

  function start() {
    setEmail(current ?? "")
    setError(null)
    setSuccess(null)
    setOpen(true)
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch("/api/patient/profile/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "Could not save your email.")
      setSuccess(current ? "Email updated." : "Email added — you can sign in with it too.")
      setCurrent(data.email)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your email.")
    } finally {
      setSaving(false)
    }
  }

  const unchanged = email.trim().toLowerCase() === (current ?? "")

  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Mail className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Email</p>
          <p className="truncate text-xs text-muted-foreground">
            {current === undefined ? "Loading…" : current ?? "Not added — add one to sign in with it"}
          </p>
        </div>
        {!open && (
          <Button size="sm" variant="outline" onClick={start} disabled={current === undefined}>
            {current ? "Change" : "Add"}
          </Button>
        )}
      </div>

      {success && !open && (
        <p className="mt-2 flex items-center gap-1.5 pl-12 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5" />
          {success}
        </p>
      )}

      {open && (
        <form onSubmit={save} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:pl-12">
          <Input
            id="accountEmail"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={saving}
            required
            autoFocus
            className="h-9 sm:flex-1"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !email.trim() || unchanged}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : current ? "Update" : "Add email"}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive sm:basis-full">{error}</p>}
        </form>
      )}
    </div>
  )
}
