"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Send } from "lucide-react"
import { PredictSpinner } from "@/src/components/predict-loader"
import { extractPlaceholders } from "@/src/lib/whatsapp-templates"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"

interface TemplateOption {
  id: string
  key: string
  name: string
  channel: string
  bodyText: string | null
  submissionStatus: string
  variablesSchema: unknown
  headerType?: string | null
  headerMediaUrl?: string | null
}

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"

/**
 * Approved WhatsApp templates, sent to this exact person. Used from the lead
 * profile during a call — the brochure and anything else Meta has approved,
 * without leaving the profile for the inbox.
 */
export function SendTemplateDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  contactName: string | null
  onSent: () => void | Promise<void>
}) {
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null)
  const [search, setSearch] = useState("")
  const [templateKey, setTemplateKey] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        setTemplates(
          (data.templates ?? []).filter(
            (t: TemplateOption) => t.channel === "whatsapp" && t.submissionStatus === "approved",
          ),
        )
      })
      .catch(() => setTemplates([]))
  }, [open])

  const selected = templates?.find((t) => t.key === templateKey) ?? null
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = templates ?? []
    if (!q) return list
    return list.filter((t) => [t.name, t.key, t.bodyText].some((v) => (v ?? "").toLowerCase().includes(q)))
  }, [templates, search])

  const names = Array.isArray(selected?.variablesSchema)
    ? (selected.variablesSchema as unknown[]).filter((n): n is string => typeof n === "string")
    : []
  const fields = extractPlaceholders(selected?.bodyText ?? "").map((n) => ({
    key: names[n - 1] ?? String(n),
    n,
    label: names[n - 1] ?? `Value ${n}`,
  }))
  const missing = fields.filter((f) => !values[f.key]?.trim()).length

  const choose = (key: string) => {
    setTemplateKey(key)
    const t = templates?.find((x) => x.key === key)
    const declared = Array.isArray(t?.variablesSchema)
      ? (t.variablesSchema as unknown[]).filter((n): n is string => typeof n === "string")
      : []
    const known = contactName?.trim() ?? ""
    const first = declared[0] ?? "1"
    setValues(known && extractPlaceholders(t?.bodyText ?? "").includes(1) ? { [first]: known } : {})
  }

  const close = () => {
    setSearch("")
    setTemplateKey("")
    setValues({})
    setError(null)
    onOpenChange(false)
  }

  const send = async () => {
    if (!selected || missing > 0) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch("/api/conversations/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId, templateKey: selected.key, variables: values }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Failed to send message")
        toast.error(data?.error ?? "Failed to send message")
        return
      }
      await onSent()
      if (data.status === "sent") {
        toast.success("Template sent")
        close()
      } else {
        setError(data.error ?? `Message logged as "${data.status}"`)
        toast.error(data.error ?? `Message logged as "${data.status}"`)
      }
    } catch {
      setError("Failed to send message")
      toast.error("Failed to send message")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Send a template</DialogTitle>
          {contactName?.trim() && (
            <p className="text-xs text-muted-foreground">To {contactName.trim()}</p>
          )}
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
          {!selected ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates"
                  className={`${inputClass} pl-8`}
                />
              </div>
              <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                {templates === null ? (
                  <div className="flex justify-center py-6">
                    <PredictSpinner className="size-5" />
                  </div>
                ) : shown.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    {templates.length === 0
                      ? "No approved WhatsApp templates yet. This list fills in after Meta approves one."
                      : `No template matches “${search}”.`}
                  </p>
                ) : (
                  shown.map((t) => (
                    <Button
                      key={t.id}
                      type="button"
                      onClick={() => choose(t.key)} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left block w-full text-left last:border-0">
                      <span className="block truncate text-sm font-medium">{t.name}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{t.bodyText}</span>
                    </Button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">Template</p>
                  <p className="truncate text-sm font-medium">{selected.name}</p>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    setTemplateKey("")
                    setValues({})
                  }} size="sm" variant="ghost" className="text-primary">
                  Change
                </Button>
              </div>
              {selected.headerType === "DOCUMENT" && selected.headerMediaUrl && (
                <p className="text-xs text-muted-foreground">A PDF is attached to this template and will be sent with it.</p>
              )}
              {fields.length === 0 ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{selected.bodyText}</p>
              ) : (
                fields.map((f) => (
                  <div key={f.key}>
                    <label className="mb-1 block text-xs font-medium capitalize text-muted-foreground">{f.label}</label>
                    <input
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                ))
              )}
            </>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" onClick={send} disabled={!selected || missing > 0 || sending}>
            {sending ? <PredictSpinner className="size-4" /> : <Send />}
            Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
