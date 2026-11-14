"use client"

import React, { useState } from "react"
import { Check, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

function PasswordInput({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 pr-9"
          autoComplete={id === "currentPassword" ? "current-password" : "new-password"}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  )
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
      <Check className={`size-3 ${ok ? "" : "opacity-40"}`} />
      {children}
    </span>
  )
}

/**
 * The password, as one row of the sign-in card: whether one is set, and a
 * button that opens the boxes only when asked. Somebody registered at the
 * clinic by mobile may have none yet — then it offers to set one.
 */
export function PasswordRow({
  hasPassword,
  onSaved,
}: {
  hasPassword: boolean
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isMinLength = newPassword.length >= 8
  const hasNumber = /\d/.test(newPassword)
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)
  const isMatching = newPassword !== "" && newPassword === confirmPassword
  const canSubmit = isMinLength && isMatching && (!hasPassword || currentPassword.length > 0)

  function close() {
    setOpen(false)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setError(null)
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!canSubmit) return
    setSaving(true)
    try {
      const res = await fetch("/api/patient/profile/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(hasPassword ? { currentPassword } : {}), newPassword }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || data?.message || "Could not save the password.")
      setSuccess(hasPassword ? "Password updated." : "Password set — you can sign in with it now.")
      close()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            Password
            <Badge
              variant="outline"
              className={`rounded-full px-2 py-0 text-[10px] ${
                hasPassword
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
            >
              {hasPassword ? "Set" : "Not set"}
            </Badge>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {hasPassword ? "Sign in with your mobile number or email and this password." : "Set one to sign in without a code."}
          </p>
        </div>
        {!open && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSuccess(null)
              setOpen(true)
            }}
          >
            {hasPassword ? "Change" : "Set password"}
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
        <form onSubmit={submit} className="mt-3 space-y-3 sm:pl-12">
          <div className={`grid gap-3 ${hasPassword ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {hasPassword && (
              <PasswordInput id="currentPassword" label="Current password" value={currentPassword} onChange={setCurrentPassword} placeholder="Current password" />
            )}
            <PasswordInput id="newPassword" label={hasPassword ? "New password" : "Password"} value={newPassword} onChange={setNewPassword} placeholder="At least 8 characters" />
            <PasswordInput id="confirmPassword" label="Confirm" value={confirmPassword} onChange={setConfirmPassword} placeholder="Type it again" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <Rule ok={isMinLength}>8+ characters</Rule>
            <Rule ok={hasNumber}>A number</Rule>
            <Rule ok={hasSpecialChar}>A symbol</Rule>
            <Rule ok={isMatching}>Both match</Rule>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !canSubmit}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : hasPassword ? "Update password" : "Set password"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
