"use client"
import { Button } from "@workspace/ui/components/button"

import { useEffect, useMemo, useState } from "react"
import { Send, AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

interface TemplateRow {
  id: string
  key: string
  name: string
  channel: string
  category: string
  language: string | null
  bodyText: string | null
  variablesSchema: unknown
  submissionStatus: string
}

interface SendResult {
  contactId: string
  name?: string | null
  phone?: string | null
  status: string
  error?: string
}

interface VariableBinding {
  source: "contactField" | "literal"
  value: string
  fallback?: string
}

interface LeadBroadcastDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactIds: string[]
  onSent: () => void
}

// One request per batch, matching the server's per-request cap. Progress is
// reported between batches so a few hundred recipients is visibly moving
// rather than one long unexplained wait.
const BATCH_SIZE = 50

const CONTACT_FIELD_OPTIONS = [
  { value: "name", label: "Contact name" },
  { value: "phone", label: "Contact phone" },
  { value: "email", label: "Contact email" },
]

const inputClass =
  "w-full rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none"
const selectClass =
  "rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"

function variableNamesOf(template: TemplateRow | undefined): string[] {
  if (!template || !Array.isArray(template.variablesSchema)) return []
  return (template.variablesSchema as unknown[]).filter((n): n is string => typeof n === "string")
}

/** A template can only open a conversation once Meta has approved it. */
function isSendable(template: TemplateRow): boolean {
  return template.channel !== "whatsapp" || template.submissionStatus === "approved"
}

export function LeadBroadcastDialog({
  open,
  onOpenChange,
  contactIds,
  onSent,
}: LeadBroadcastDialogProps) {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [templateKey, setTemplateKey] = useState("")
  const [bindings, setBindings] = useState<Record<string, VariableBinding>>({})
  const [sending, setSending] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [results, setResults] = useState<SendResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const template = useMemo(
    () => templates.find((t) => t.key === templateKey),
    [templates, templateKey],
  )
  const variableNames = useMemo(() => variableNamesOf(template), [template])

  useEffect(() => {
    if (!open) {
      setTemplateKey("")
      setBindings({})
      setSending(false)
      setSentCount(0)
      setResults(null)
      setError(null)
      return
    }
    setLoadingTemplates(true)
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => setTemplates((data.templates ?? []).filter(isSendable)))
      .catch(() => setError("Could not load templates"))
      .finally(() => setLoadingTemplates(false))
  }, [open])

  // Seed a sensible binding per variable when the template changes: anything
  // that looks like a name comes from the contact row, everything else is
  // typed once and sent to everyone.
  useEffect(() => {
    const seeded: Record<string, VariableBinding> = {}
    for (const name of variableNames) {
      seeded[name] = /name/i.test(name)
        ? { source: "contactField", value: "name", fallback: "there" }
        : { source: "literal", value: "" }
    }
    setBindings(seeded)
  }, [variableNames])

  const setBinding = (name: string, patch: Partial<VariableBinding>) => {
    setBindings((prev) => ({
      ...prev,
      [name]: { ...(prev[name] ?? { source: "literal", value: "" }), ...patch },
    }))
  }

  // A literal with no text would be sent to everyone as an empty parameter,
  // which WhatsApp rejects — catch it here instead of in 200 failed sends.
  const emptyLiterals = variableNames.filter(
    (name) => bindings[name]?.source === "literal" && !bindings[name]?.value?.trim(),
  )

  const handleSend = async () => {
    setSending(true)
    setError(null)
    setSentCount(0)

    // Stable for the whole broadcast: the server derives an idempotency key
    // from it, so a retried or double-clicked batch cannot double-send.
    const broadcastId = crypto.randomUUID()
    const collected: SendResult[] = []

    try {
      for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
        const batch = contactIds.slice(i, i + BATCH_SIZE)
        const res = await fetch("/api/leads/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateKey, broadcastId, contactIds: batch, variables: bindings }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Send failed")
        collected.push(...(data.results ?? []))
        setSentCount(collected.length)
      }
      setResults(collected)
      toast.success("Broadcast sent")
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed")
      toast.error(err instanceof Error ? err.message : "Send failed")
    } finally {
      setSending(false)
    }
  }

  const tally = useMemo(() => {
    if (!results) return null
    const counts: Record<string, number> = {}
    for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1
    return counts
  }, [results])

  const failures = results?.filter((r) => r.status === "failed" || r.status.startsWith("skipped"))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send a template</DialogTitle>
          <DialogDescription>
            {contactIds.length} lead{contactIds.length === 1 ? "" : "s"} selected. Consent and
            opt-out are checked per contact before anything is sent.
          </DialogDescription>
        </DialogHeader>

        {!results && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Template</label>
              {loadingTemplates ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <PredictSpinner className="size-4" /> Loading templates…
                </div>
              ) : templates.length === 0 ? (
                <p className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                  No sendable templates. A WhatsApp template has to be approved by Meta before it
                  can open a conversation.
                </p>
              ) : (
                <select
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  className={`${selectClass} w-full`}
                >
                  <option value="">Choose a template…</option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name} · {t.channel}
                      {t.language ? ` · ${t.language}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {template?.bodyText && (
              <div className="rounded-md bg-muted p-3">
                <p className="mb-1 text-[11px] font-medium text-muted-foreground">Message</p>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{template.bodyText}</p>
              </div>
            )}

            {template && template.category === "marketing" && (
              <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Marketing template — anyone who opted out of marketing will be skipped, and
                skipped sends still appear in their conversation log.
              </p>
            )}

            {variableNames.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Variables</p>
                {variableNames.map((name) => {
                  const binding = bindings[name]
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">
                        {name}
                      </span>
                      <select
                        value={binding?.source === "contactField" ? binding.value : "__literal"}
                        onChange={(e) =>
                          e.target.value === "__literal"
                            ? setBinding(name, { source: "literal", value: "" })
                            : setBinding(name, {
                                source: "contactField",
                                value: e.target.value,
                                fallback: binding?.fallback ?? "",
                              })
                        }
                        className={selectClass}
                      >
                        {CONTACT_FIELD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                        <option value="__literal">Same text for everyone</option>
                      </select>
                      <input
                        value={
                          binding?.source === "literal" ? binding.value : (binding?.fallback ?? "")
                        }
                        onChange={(e) =>
                          binding?.source === "literal"
                            ? setBinding(name, { value: e.target.value })
                            : setBinding(name, { fallback: e.target.value })
                        }
                        placeholder={
                          binding?.source === "literal" ? "Text to send" : "Fallback if empty"
                        }
                        className={`${inputClass} flex-1`}
                      />
                    </div>
                  )
                })}
                <p className="text-[11px] text-muted-foreground">
                  A contact with no value and no fallback is skipped rather than sent an empty
                  placeholder.
                </p>
              </div>
            )}
          </div>
        )}

        {sending && (
          <p className="text-sm text-muted-foreground">
            Sending… {sentCount} of {contactIds.length}
          </p>
        )}

        {results && tally && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(tally).map(([status, count]) => (
                <span
                  key={status}
                  className={`rounded px-2 py-0.5 text-[11px] ${
                    status === "failed" || status.startsWith("skipped")
                      ? "bg-amber-100 text-amber-800"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  {status.replace(/_/g, " ")}: {count}
                </span>
              ))}
            </div>
            {failures && failures.length > 0 && (
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {failures.map((failure) => (
                  <p key={failure.contactId} className="text-[11px] text-muted-foreground">
                    {failure.name || failure.phone || failure.contactId} — {failure.error ?? failure.status}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={sending} variant="outline">
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && (
            <Button
              type="button"
              onClick={handleSend}
              disabled={!templateKey || sending || emptyLiterals.length > 0}
              title={
                emptyLiterals.length > 0
                  ? `Fill in: ${emptyLiterals.join(", ")}`
                  : undefined
              }>
              {sending ? <PredictSpinner className="size-4" /> : <Send className="h-4 w-4" />}
              Send to {contactIds.length}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
