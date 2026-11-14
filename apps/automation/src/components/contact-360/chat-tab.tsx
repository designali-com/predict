"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useRef, useState } from "react"
import { Send, Bot, FileText } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { SendTemplateDialog } from "@/src/components/contact-360/send-template-dialog"
import {
  WhatsAppBubbles,
  waInput,
  waLog,
  waMuted,
  waPanel,
  waRule,
  type WaMessage,
} from "@/src/components/whatsapp-thread"
import { LIVE_POLL_MS, useNow, windowRemaining, WindowBadge } from "@/src/components/whatsapp-window"

interface AiMessage {
  id: string
  role: string
  content: string
  createdAt: string
}

interface AiThread {
  id: string
  title: string | null
  createdAt: string
  messages: AiMessage[]
}

interface ChatData {
  conversationId: string | null
  messages: WaMessage[]
  sessionOpen: boolean
  lastInboundAt: string | null
  aiThreads: AiThread[]
}

export function ChatTab({ contactId, contactName }: { contactId: string; contactName?: string | null }) {
  const [data, setData] = useState<ChatData | null>(null)
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAi, setShowAi] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const now = useNow()

  const load = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}/chat`)
    if (!res.ok) {
      setLoading(false)
      return
    }
    const next = await res.json().catch(() => null)
    if (next) setData(next)
    setLoading(false)
  }, [contactId])

  useEffect(() => {
    load()
  }, [load])

  // A reply lands in the database from the webhook. While this tab is open,
  // ask often enough that the bubble and the 24h window both move on their own.
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) load()
    }, LIVE_POLL_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [data?.messages.length])

  const send = async () => {
    const text = body.trim()
    if (!text || sending || !data?.conversationId) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/conversations/${data.conversationId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok) {
        setError(result?.error ?? "Failed to send message")
        toast.error(result?.error ?? "Failed to send message")
        return
      }
      // The row is written whatever Meta says, so reload before judging the
      // outcome — a rejected send should still appear in the thread as failed.
      setBody("")
      await load()
      if (result.status !== "sent") {
        setError(
          result.error ??
            "WhatsApp rejected this message. Free-form text only works within 24 hours of the contact's last reply.",
        )
        toast.error(result.error ?? "WhatsApp rejected this message")
      } else {
        toast.success("Message sent")
      }
    } catch {
      setError("Failed to send message")
      toast.error("Failed to send message")
    } finally {
      setSending(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  const open = windowRemaining(data.lastInboundAt, now) != null
  const windowLine = !data.lastInboundAt
    ? "They have never replied"
    : open
      ? "Free-form replies will reach them"
      : "24h window closed — only a template will reach them"

  return (
    <div className="space-y-4">
      <section className={`${waPanel} h-[min(720px,calc(100svh-16rem))] min-h-[420px]`}>
        <header className={`flex items-center gap-3 border-b px-3 py-2.5 ${waRule}`}>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-tight">
              {open && <WindowBadge lastInboundAt={data.lastInboundAt} now={now} />}
              <span className="truncate">WhatsApp</span>
            </p>
            <p className={`truncate text-xs ${open ? "text-emerald-700 dark:text-emerald-400" : waMuted}`}>
              {windowLine}
            </p>
          </div>
        </header>

        <div className={waLog}>
          <WhatsAppBubbles messages={data.messages} />
          <div ref={bottom} />
        </div>

        <div className={`border-t bg-white p-2.5 dark:bg-black sm:p-3 ${waRule}`}>
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          {data.conversationId ? (
            <>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  onClick={() => setTemplateOpen(true)}
                  title="Send a template"
                  aria-label="Send a template"
                  size="sm"
                  variant="outline"
                  className="h-10 shrink-0"
                >
                  <FileText className="h-4 w-4" />
                  <span className="max-sm:hidden">Template</span>
                </Button>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  rows={1}
                  placeholder="Type a message…"
                  className={waInput}
                />
                <Button
                  onClick={send}
                  disabled={!body.trim() || sending}
                  title="Send"
                  aria-label="Send"
                  size="icon"
                  className="size-10 shrink-0"
                >
                  {sending ? <PredictSpinner className="size-4" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className={`text-xs ${waMuted}`}>
                No WhatsApp conversation yet. Send a template to start one.
              </p>
              <Button type="button" size="sm" onClick={() => setTemplateOpen(true)}>
                <FileText />
                Send template
              </Button>
            </div>
          )}
        </div>
      </section>

      {data.aiThreads.length > 0 && (
        <section className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
              <Bot className="h-3.5 w-3.5" />
              AI assistant history ({data.aiThreads.length})
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowAi((v) => !v)}>
              {showAi ? "Hide" : "Show"}
            </Button>
          </div>

          {showAi && (
            <div className="mt-3 space-y-4">
              {data.aiThreads.map((t) => (
                <div key={t.id}>
                  <p className={`text-xs font-medium ${waMuted}`}>
                    {t.title ?? "Untitled"}{" "}
                    <span className="font-normal">· {new Date(t.createdAt).toLocaleDateString()}</span>
                  </p>
                  <div className="mt-1.5 space-y-1.5">
                    {t.messages.map((m) => (
                      <p
                        key={m.id}
                        className={`rounded-md px-2.5 py-1.5 text-xs ${
                          m.role === "user"
                            ? "bg-black/[0.04] dark:bg-white/[0.06]"
                            : "border border-black/12 dark:border-white/10"
                        }`}
                      >
                        <span className="font-medium">{m.role === "user" ? "Patient" : "AI"}:</span>{" "}
                        {m.content}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <SendTemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        contactId={contactId}
        contactName={contactName ?? null}
        onSent={load}
      />
    </div>
  )
}
