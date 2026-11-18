"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Users } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"

interface AudienceRow {
  id: string
  name: string
  description: string | null
  memberCount: number
  createdAt: string
}

export default function AudiencePage() {
  const [audiences, setAudiences] = useState<AudienceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/audiences")
      .then((res) => res.json())
      .then((data) => setAudiences(data.audiences ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audience"
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/audience/new" />}>
            <Plus />
            New Audience
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : audiences.length === 0 ? (
        <p className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
          No audiences yet. Create your first one.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {audiences.map((a) => (
            <Link
              key={a.id}
              href={`/audience/${a.id}`}
              className="rounded-md border border-border p-4 transition hover:bg-muted/5"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{a.name}</p>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {a.memberCount}
                </span>
              </div>
              {a.description && <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Created {new Date(a.createdAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
