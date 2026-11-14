"use client"
import { Button } from "@workspace/ui/components/button"

import { useState } from "react"
import { ChevronDown, FileText } from "lucide-react"

export interface LeadForm {
  id: string
  provider: string
  externalId: string
  formName: string | null
  formId: string | null
  campaignName: string | null
  campaignId: string | null
  adsetName: string | null
  adsetId: string | null
  adName: string | null
  adId: string | null
  platform: string | null
  answers: Record<string, string>
  raw: unknown
  isTest: boolean
  isOrganic: boolean
  submittedAt: string | null
  receivedAt: string
}

const PROVIDER_LABEL: Record<string, string> = {
  meta: "Meta ad",
  google: "Google ad",
  website: "Website",
}

function humanize(label: string) {
  const text = label.replace(/[_?]+/g, " ").trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Name on the first line, Meta's id under it. */
function namedId(name: string | null, id: string | null): { title: string; id: string | null } | null {
  if (!name && !id) return null
  if (name && id && name !== id) return { title: name, id }
  return { title: name ?? id!, id: null }
}

/**
 * The lead forms this person filled in — what they told us before anyone
 * called, and which ad brought them. Newest first; all closed until clicked.
 */
export function LeadForms({ forms }: { forms: LeadForm[] }) {
  const [open, setOpen] = useState<string | null>(null)
  if (forms.length === 0) return null

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium">
        <FileText className="h-4 w-4 text-muted-foreground" />
        Lead forms
        <span className="text-xs font-normal text-muted-foreground">{forms.length}</span>
      </div>
      <ul className="divide-y divide-border">
        {forms.map((f) => {
          const isOpen = open === f.id
          const when = new Date(f.submittedAt ?? f.receivedAt)
          const answers = Object.entries(f.answers ?? {})
          const source = [
            ["Form", namedId(f.formName, f.formId)],
            ["Campaign", namedId(f.campaignName, f.campaignId)],
            ["Ad set", namedId(f.adsetName, f.adsetId)],
            ["Ad", namedId(f.adName, f.adId)],
            ["Platform", f.platform ? { title: f.platform, id: null } : null],
            ["Leadgen ID", f.externalId ? { title: f.externalId, id: null } : null],
          ].filter((entry): entry is [string, { title: string; id: string | null }] => Boolean(entry[1]))

          return (
            <li key={f.id}>
              <Button
                onClick={() => setOpen(isOpen ? null : f.id)} variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left w-full flex-wrap text-left">
                <span className="font-medium">{f.formName ?? PROVIDER_LABEL[f.provider] ?? f.provider}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {PROVIDER_LABEL[f.provider] ?? f.provider}
                </span>
                {f.isTest && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">test</span>}
                {f.isOrganic && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">organic</span>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {when.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </Button>

              {isOpen && (
                <div className="grid gap-4 px-3 pb-3 text-sm md:grid-cols-2">
                  <dl className="space-y-1.5">
                    {answers.length === 0 && <p className="text-muted-foreground">No form answers.</p>}
                    {answers.map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs text-muted-foreground">{humanize(k)}</dt>
                        <dd className="break-words">{v || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="space-y-1.5">
                    <dl className="space-y-1">
                      {source.map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="w-20 shrink-0 text-xs text-muted-foreground">{k}</dt>
                          <dd className="min-w-0 break-all text-xs">
                            <div>{v.title}</div>
                            {v.id && <div className="text-muted-foreground">{v.id}</div>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Raw payload</summary>
                      <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px]">
                        {JSON.stringify(f.raw, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
