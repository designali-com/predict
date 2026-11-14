"use client"

import { useEffect, useState } from "react"
import { UserPlus } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const EMPTY = { name: "", phone: "", email: "", city: "" }

/**
 * A lead entered by hand. Name and phone are enough; the lead lands as New,
 * on this clinic's list, with no appointment.
 */
export function AddLeadDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void | Promise<void>
}) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(EMPTY)
    setError(null)
    setSaving(false)
  }, [open])

  const set = (key: keyof typeof EMPTY, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Could not add the lead")
        return
      }
      toast.success("Lead added — status New")
      onOpenChange(false)
      await onCreated?.()
    } catch {
      setError("Could not add the lead")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add lead</DialogTitle>
          <DialogDescription>They start as New. No appointment is booked.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
              autoComplete="name"
            />
          </Field>
          <Field label="Phone">
            <input
              required
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              className={inputClass}
              inputMode="tel"
              autoComplete="tel"
              placeholder="10-digit mobile"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputClass}
              autoComplete="email"
            />
          </Field>
          <Field label="City">
            <input
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              className={inputClass}
              autoComplete="address-level2"
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <PredictSpinner className="size-4" /> : <UserPlus />}
              Add lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
