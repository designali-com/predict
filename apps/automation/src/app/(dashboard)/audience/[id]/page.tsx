"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Plus, X } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { PageHeader } from "@workspace/ui/components/page-header"

interface Member {
  contactId: string
  name: string | null
  phone: string | null
  email: string | null
  status: string
  addedAt: string
}

interface Contact {
  id: string
  name: string | null
  phone: string | null
  email: string | null
}

export default function AudienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [audience, setAudience] = useState<{ name: string; description: string | null } | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [allContacts, setAllContacts] = useState<Contact[]>([])
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(`/api/audiences/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setAudience(data.audience)
        setMembers(data.members ?? [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  const openAdd = () => {
    setShowAdd(true)
    if (allContacts.length === 0) {
      fetch("/api/contacts")
        .then((res) => res.json())
        .then((data) => setAllContacts(data.contacts ?? []))
    }
  }

  const memberIds = useMemo(() => new Set(members.map((m) => m.contactId)), [members])

  const candidates = useMemo(() => {
    const q = query.toLowerCase()
    return allContacts.filter((c) => {
      if (memberIds.has(c.id)) return false
      if (!q) return true
      return c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
    })
  }, [allContacts, memberIds, query])

  const addMember = async (contactId: string) => {
    setAdding(true)
    const res = await fetch(`/api/audiences/${id}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactIds: [contactId] }),
    })
    if (res.ok) toast.success("Member added")
    else {
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? "Couldn't add member")
    }
    setAdding(false)
    load()
  }

  const removeMember = async (contactId: string) => {
    const res = await fetch(`/api/audiences/${id}/members`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId }),
    })
    if (res.ok) toast.success("Member removed")
    else {
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? "Couldn't remove member")
    }
    load()
  }

  if (loading || !audience) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title={audience.name} description={audience.description} />

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{members.length} members</span>
        <Button
          onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add members
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-md border border-border p-3">
          <input
            placeholder="Search patients"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 w-full rounded-md border border-border px-3 py-1.5 text-sm focus:outline-none"
          />
          <div className="max-h-56 overflow-y-auto">
            {candidates.slice(0, 50).map((c) => (
              <Button
                key={c.id}
                disabled={adding}
                onClick={() => addMember(c.id)} size="sm" variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left">
                <span>{c.name ?? c.phone ?? c.email}</span>
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => (
              <tr key={m.contactId}>
                <td className="px-4 py-2.5 font-medium">
                  <Link href={`/contacts/${m.contactId}`} className="hover:underline">
                    {m.name ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{m.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{m.status}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button onClick={() => removeMember(m.contactId)} variant="destructive">
                    <X className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
