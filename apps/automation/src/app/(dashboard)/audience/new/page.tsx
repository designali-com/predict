"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Save } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { PageHeader } from "@workspace/ui/components/page-header"

interface Contact {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  status: string
}

export default function NewAudiencePage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/contacts")
      .then((res) => res.json())
      .then((data) => setContacts(data.contacts ?? []))
      .finally(() => setLoadingContacts(false))
  }, [])

  const filtered = useMemo(() => {
    if (!query) return contacts
    const q = query.toLowerCase()
    return contacts.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q),
    )
  }, [contacts, query])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/audiences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          memberContactIds: Array.from(selected),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create audience")
      toast.success("Audience created")
      router.push(`/audience/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create audience")
      toast.error(err instanceof Error ? err.message : "Failed to create audience")
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    "rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none"

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="New Audience" />

      <div className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <input
          placeholder="Audience name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="rounded-md border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Members ({selected.size} selected)
          </span>
          <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search patients"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-40 text-sm focus:outline-none"
            />
          </div>
        </div>

        {loadingContacts ? (
          <div className="flex justify-center py-10">
            <PredictSpinner className="size-5" />
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {filtered.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2 text-sm hover:bg-muted/5"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="h-4 w-4"
                />
                <div className="flex flex-col">
                  <span className="font-medium">{c.name ?? c.phone ?? c.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.phone ?? "—"} · {c.status}
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button
        onClick={handleSave}
        disabled={saving || !name}>
        {saving ? <PredictSpinner className="size-4" /> : <Save className="h-4 w-4" />}
        Create Audience
      </Button>
    </div>
  )
}
