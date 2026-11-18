"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PredictSpinner } from "@/src/components/predict-loader"

const MIN = 8

export function WelcomeForm({ token }: { token: string }) {
  const [password, setPassword] = useState("")
  const [again, setAgain] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mismatch = again.length > 0 && again !== password
  const ready = password.length >= MIN && password === again && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/welcome/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      setBusy(false)
      setError(d.error ?? "Could not save your password")
      return
    }
    // Signed in now — the root page sends them to the right screen.
    window.location.href = "/"
  }

  const input =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">New password</label>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            className={`${input} pr-10`}
          />
          <Button variant="ghost" size="default" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
 type="button"
 onClick={() => setShow(!show)}
 aria-label={show ? "Hide password" : "Show password"}

 >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">At least {MIN} characters.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Type it again</label>
        <input
          type={show ? "text" : "password"}
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          autoComplete="new-password"
          className={input}
        />
        {mismatch && <p className="mt-1 text-[11px] text-red-600">The two do not match.</p>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={!ready}>
        {busy && <PredictSpinner className="size-4" />}
        Set password and sign in
      </Button>
    </form>
  )
}
