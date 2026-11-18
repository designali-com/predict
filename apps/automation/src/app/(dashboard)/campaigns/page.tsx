"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Megaphone, Plus } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import { CampaignComposer } from "@/src/components/campaign-composer"

interface CampaignRow {
  id: string
  name: string
  status: string
  createdAt: string
  templateName: string | null
  total: number
  sent: number
  failed: number
  pending: number
}

interface TemplateOption {
  id: string
  name: string
  key: string
  channel: string
  submissionStatus: string
  bodyText: string | null
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState(false)

  const load = useCallback(async () => {
    const [c, t] = await Promise.all([
      fetch("/api/campaigns").then((r) => r.json()).catch(() => null),
      fetch("/api/templates").then((r) => r.json()).catch(() => null),
    ])
    setCampaigns(c?.campaigns ?? [])
    setTemplates((t?.templates ?? []).filter((x: TemplateOption) => x.channel === "whatsapp"))
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={<Megaphone className="h-5 w-5" />}
        title="Campaigns"
        description="Send one approved template to a list of numbers, and see what happened to each."
        actions={
          <Button size="sm" onClick={() => setComposing(true)}>
            <Plus />
            New campaign
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : campaigns.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No campaigns yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Campaign</th>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Recipients</th>
                <th className="px-3 py-2 text-right font-medium">Sent</th>
                <th className="px-3 py-2 text-right font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2.5 font-medium">
                    <Link href={`/campaigns/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {c.templateName ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium capitalize">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.total}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.sent}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {composing && (
        <CampaignComposer
          templates={templates}
          onClose={() => setComposing(false)}
          onCreated={(id) => {
            setComposing(false)
            window.location.href = `/campaigns/${id}`
          }}
        />
      )}
    </div>
  )
}
