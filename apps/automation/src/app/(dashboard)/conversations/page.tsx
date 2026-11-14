"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ContactProfileSheet } from "@/src/components/contact-profile-sheet"
import { MessageCircle, Plus, Send, ArrowLeft, Search, X, FileText, ChevronLeft, ChevronRight, PlayCircle } from "lucide-react"
import { extractPlaceholders } from "@/src/lib/whatsapp-templates"
import { WhatsAppPreview, type TemplateFormState } from "@/src/components/template-builder"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "@workspace/ui/components/sonner"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@workspace/ui/components/page-header"
import { WhatsAppBubbles, waCard, waInput, waLog, waRule } from "@/src/components/whatsapp-thread"
import { LIVE_POLL_MS, latestInboundAt, useNow, WindowBadge } from "@/src/components/whatsapp-window"

interface ConversationRow {
  id: string
  channel: string
  status: string
  lastMessageAt: string | null
  lastBody?: string | null
  lastDirection?: string | null
  unread?: boolean
  /** Their last WhatsApp message. The 24h reply window is counted from this. */
  lastInboundAt?: string | null
  contactId: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
}

interface Message {
  id: string
  direction: "outbound" | "inbound"
  channel: string
  body: string | null
  variables: Record<string, unknown>
  status: string
  aiGenerated?: boolean
  createdAt: string
}

interface TemplateOption {
  id: string
  key: string
  name: string
  channel: string
  bodyText: string | null
  submissionStatus: string
  variablesSchema: unknown
  ctaButtons?: unknown
  headerType?: string | null
  headerText?: string | null
  headerMediaUrl?: string | null
  footerText?: string | null
}

// The list can wait. An open thread is polled on LIVE_POLL_MS so a reply
// shows up, and resets that contact's 24h window, without a manual refresh.
const LIST_POLL_MS = 15_000

/** 918530355551 → +91 85303 55551; anything else as stored. */
function formatPhone(phone: string | null) {
  if (!phone) return null
  const d = phone.replace(/\D/g, "")
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return phone.startsWith("+") ? phone : `+${d}`
}

function displayName(c: Pick<ConversationRow, "contactName" | "contactPhone" | "contactEmail">) {
  return c.contactName?.trim() || formatPhone(c.contactPhone) || c.contactEmail || "Unknown"
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean)
  // A number with no name: its last two digits tell rows apart better than "#".
  if (parts.length === 0) return name.replace(/\D/g, "").slice(-2) || "#"
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase()
}

/** "14:05" today, "Yesterday", "Mon" this week, "28 Sep" otherwise. */
function listTime(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const now = new Date()
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (days === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (days === 1) return "Yesterday"
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { day: "numeric", month: "short" })
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<{ conversation: ConversationRow; messages: Message[] } | null>(
    null,
  )
  const [loadingThread, setLoadingThread] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [query, setQuery] = useState("")
  // All threads, the unread ones, or only those where the person wrote back
  // (newest reply on top).
  const [view, setView] = useState<"all" | "unread" | "replied">("all")
  const onlyUnread = view === "unread"
  // The list comes a page at a time — a broadcast leaves thousands of
  // threads behind, far more than the page can draw at once.
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [search, setSearch] = useState("")

  // Search asks the server, so wait for a pause in typing rather than asking
  // on every key.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  // A new search, filter or page size starts again from the first page.
  useEffect(() => {
    setPage(1)
  }, [search, view, pageSize])

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) params.set("q", search)
    if (view === "unread") params.set("unread", "1")
    if (view === "replied") params.set("replied", "1")
    const res = await fetch(`/api/conversations?${params}`)
    const data = await res.json().catch(() => null)
    if (data?.conversations) {
      setConversations(data.conversations)
      setTotal(data.total ?? data.conversations.length)
      setUnreadCount(data.unreadTotal ?? 0)
    }
    setLoadingList(false)
  }, [page, pageSize, search, view])

  useEffect(() => {
    setLoadingList(true)
    loadConversations()
  }, [loadConversations])

  // quiet = a background refresh: no spinner, the thread stays on screen.
  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingThread(true)
    try {
      const res = await fetch(`/api/conversations/${id}`)
      if (!res.ok) return
      const data = await res.json()
      setThread(data)
      const inbound = latestInboundAt(data.messages ?? [])
      // Opening it marked it read; the sidebar badge recounts now.
      // Their newest message also moves the 24h window on the list row.
      window.dispatchEvent(new Event("inbox:read"))
      setConversations((list) =>
        list.map((c) =>
          c.id === id ? { ...c, unread: false, lastInboundAt: inbound ?? c.lastInboundAt } : c,
        ),
      )
    } finally {
      if (!quiet) setLoadingThread(false)
    }
  }, [])

  // The open chat lives in the URL (?c=…), so leaving the page — the full
  // profile, a lead — and pressing Back lands on the same chat, not the list.
  const restored = useRef(false)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c")
    if (c) setSelectedId(c)
    restored.current = true
  }, [])
  useEffect(() => {
    if (!restored.current) return
    const url = new URL(window.location.href)
    if (selectedId) url.searchParams.set("c", selectedId)
    else url.searchParams.delete("c")
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url)
  }, [selectedId])

  useEffect(() => {
    if (selectedId) loadThread(selectedId)
    else setThread(null)
  }, [selectedId, loadThread])

  // Replies keep arriving while the page is open. The open thread is asked
  // often enough that a new message, and the window reset it causes, show
  // up on their own.
  useEffect(() => {
    const listTimer = setInterval(() => {
      if (document.hidden) return
      loadConversations()
    }, LIST_POLL_MS)
    const liveTimer = setInterval(() => {
      if (document.hidden || !selectedId) return
      loadThread(selectedId, true)
    }, LIVE_POLL_MS)
    return () => {
      clearInterval(listTimer)
      clearInterval(liveTimer)
    }
  }, [selectedId, loadConversations, loadThread])

  // Jump straight into the thread the message landed in, so the send is
  // visible where it happened rather than only as a confirmation line.
  const handleSent = async (conversationId: string | null) => {
    await loadConversations()
    if (!conversationId) return
    if (conversationId === selectedId) await loadThread(conversationId, true)
    else setSelectedId(conversationId)
  }

  // Filtered and paged on the server already.
  const shown = conversations
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const now = useNow()

  return (
    // The inbox fills the screen and never scrolls as a page: the list and the
    // chat each scroll on their own, like any messaging app. The height is the
    // viewport less the header and the shell's padding (p-4, lg:p-6) and, from
    // md up, the inset margin.
    <div className="flex h-[calc(100svh-var(--header-height)-2rem-2px)] min-h-[420px] flex-col gap-3 md:h-[calc(100svh-var(--header-height)-3rem-2px)] lg:h-[calc(100svh-var(--header-height)-4rem-2px)]">
      <PageHeader
        className={selectedId ? "max-md:hidden" : undefined}
        title="Inbox"
        description={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        actions={
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <Plus />
            New message
          </Button>
        }
      />

      <TemplateSendDialog open={composeOpen} onOpenChange={setComposeOpen} onSent={handleSent} />

      {/* Two panes side by side from md up. On a phone one at a time: the
          list, or the open chat with a way back to it. */}
      <div className={`flex min-h-0 flex-1 flex-row ${waCard}`}>
        {/* ── Conversation list ─────────────────────────────────────────── */}
        <aside
          className={`min-h-0 w-full flex-col border-black/18 md:flex md:w-80 md:shrink-0 md:border-r lg:w-96 dark:border-white/10 ${
            selectedId ? "hidden" : "flex"
          }`}
        >
          <div className={`space-y-2 border-b p-3 ${waRule}`}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or number"
                inputMode="search"
                className="w-full rounded-md border border-black/18 bg-white py-2 pl-8 pr-8 text-sm text-black focus:border-black/40 focus:outline-none dark:border-white/15 dark:bg-black dark:text-white"
              />
              {query && (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="flex gap-1.5 text-xs">
              {([
                { key: "all", label: "All" },
                { key: "unread", label: `Unread${unreadCount ? ` (${unreadCount})` : ""}` },
                { key: "replied", label: "Replied" },
              ] as const).map((f) => (
                <Button
                  key={f.key}
                  type="button"
                  onClick={() => setView(f.key)} size="sm" variant={view === f.key ? "default" : "outline"}>
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex justify-center py-10">
                <PredictSpinner className="size-5" />
              </div>
            ) : shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {search
                  ? `Nothing matches “${search}”.`
                  : onlyUnread
                    ? "No unread conversations."
                    : view === "replied"
                      ? "Nobody has replied yet."
                      : "No conversations yet."}
              </p>
            ) : (
              <ul>
                {shown.map((c) => {
                  const name = displayName(c)
                  const active = selectedId === c.id
                  return (
                    <li key={c.id} className={`border-b last:border-b-0 ${waRule}`}>
                      <Button
                        onClick={() => setSelectedId(c.id)}
                        variant="ghost"
                        className={`h-auto w-full justify-start gap-3 rounded-none px-3 py-3 whitespace-normal text-left ${
                          active ? "bg-black/[0.04] dark:bg-white/[0.06]" : ""
                        }`}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {initials(name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5">
                              {c.channel === "whatsapp" && (
                                <WindowBadge lastInboundAt={c.lastInboundAt} now={now} />
                              )}
                              <span className={`truncate text-sm ${c.unread ? "font-semibold" : "font-medium"}`}>
                                {name}
                              </span>
                            </span>
                            <span
                              className={`shrink-0 text-[11px] ${c.unread ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                            >
                              {view === "replied" && c.lastInboundAt
                                ? `Replied ${listTime(c.lastInboundAt)}`
                                : listTime(c.lastMessageAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span
                              className={`truncate text-xs ${c.unread ? "text-foreground" : "text-muted-foreground"}`}
                            >
                              {c.lastDirection === "outbound" && "You: "}
                              {c.lastBody?.replace(/\s+/g, " ") ||
                                (c.contactName ? formatPhone(c.contactPhone) : c.channel) ||
                                "No messages yet"}
                            </span>
                            {c.unread && (
                              <span aria-label="Unread" className="size-2.5 shrink-0 rounded-full bg-emerald-500" />
                            )}
                          </span>
                        </span>
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Pager: how many per page, where we are of how many, back and on. */}
          <div className={`flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2 text-xs ${waRule}`}>
            <label className="flex items-center gap-1.5 text-muted-foreground">
              Show
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Conversations per page"
                className="rounded-md border border-black/18 bg-white px-1.5 py-1 text-xs text-black focus:outline-none dark:border-white/15 dark:bg-black dark:text-white"
              >
                {[20, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span className="tabular-nums text-muted-foreground">
              {from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Previous page"
                disabled={page <= 1 || loadingList}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-12 text-center tabular-nums">
                {page} / {pages}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Next page"
                disabled={page >= pages || loadingList}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </aside>

        {/* ── Open chat ─────────────────────────────────────────────────── */}
        <section className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${selectedId ? "flex" : "hidden"}`}>
          {!selectedId ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-60" />
              <span className="text-sm">Pick a conversation to read it</span>
            </div>
          ) : loadingThread || !thread ? (
            <div className="flex h-full items-center justify-center">
              <PredictSpinner />
            </div>
          ) : (
            <ChatPane
              conversation={thread.conversation}
              messages={thread.messages}
              now={now}
              onBack={() => setSelectedId(null)}
              onSent={async () => {
                await loadThread(thread.conversation.id, true)
                loadConversations()
              }}
            />
          )}
        </section>
      </div>
    </div>
  )
}

function ChatPane({
  conversation,
  messages,
  now,
  onBack,
  onSent,
}: {
  conversation: ConversationRow
  messages: Message[]
  now: number
  onBack: () => void
  onSent: () => void | Promise<void>
}) {
  const name = displayName(conversation)
  const bottom = useRef<HTMLDivElement>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  // Open at the newest message, and follow new ones as they arrive.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [conversation.id, messages.length])

  return (
    <>
      <header className={`flex items-center gap-3 border-b px-3 py-2.5 ${waRule}`}>
        <Button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations" size="icon-sm" variant="ghost" className="md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 leading-tight">
            {conversation.channel === "whatsapp" && (
              <WindowBadge lastInboundAt={latestInboundAt(messages)} now={now} />
            )}
            <span className="truncate font-medium">{name}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[formatPhone(conversation.contactPhone), conversation.channel].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setProfileOpen(true)}>
          Profile
        </Button>
      </header>

      <ContactProfileSheet contactId={conversation.contactId} open={profileOpen} onOpenChange={setProfileOpen} />

      <div className={waLog}>
        <WhatsAppBubbles messages={messages} />
        <div ref={bottom} />
      </div>

      <MessageComposer
        conversationId={conversation.id}
        channel={conversation.channel}
        onSent={onSent}
        onTemplate={() => setTemplateOpen(true)}
      />

      <TemplateSendDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onSent={() => onSent()}
        contact={{ id: conversation.contactId, name: conversation.contactName, phone: conversation.contactPhone }}
      />
    </>
  )
}

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"

function MessageComposer({
  conversationId,
  channel,
  onSent,
  onTemplate,
}: {
  conversationId: string
  channel: string
  onSent: () => void | Promise<void>
  /** Opens the template picker — the only way to reach someone outside the 24-hour window. */
  onTemplate: () => void
}) {
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clear whatever was half-typed against the previous contact.
  useEffect(() => {
    setBody("")
    setError(null)
  }, [conversationId])

  if (channel !== "whatsapp") {
    return (
      <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        Free-form replies are only supported on WhatsApp.
      </div>
    )
  }

  const send = async () => {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Failed to send message")
        toast.error(data?.error ?? "Failed to send message")
        return
      }
      // The row is written either way, so refresh the thread before deciding
      // what to say — a rejected send should still be visible as failed.
      setBody("")
      await onSent()
      if (data.status !== "sent") {
        setError(
          data.error ??
            "WhatsApp rejected this message. Free-form text only works within 24 hours of the contact's last reply.",
        )
        toast.error(data.error ?? "WhatsApp rejected this message")
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

  return (
    <div className={`border-t bg-white p-2.5 dark:bg-black sm:p-3 ${waRule}`}>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <div className="flex items-end gap-2">
        <Button
          type="button"
          onClick={onTemplate}
          title="Send a template"
          aria-label="Send a template" size="sm" variant="outline" className="h-10 shrink-0">
          <FileText className="h-4 w-4" />
          <span className="max-sm:hidden">Template</span>
        </Button>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter starts a new line — the chat convention.
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
          className="size-10 shrink-0 p-0">
          {sending ? <PredictSpinner className="size-4" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

interface MediaAsset {
  id: string
  url: string
  fileName: string
  assetType: string // image | video | document
}

const MEDIA_KIND: Record<string, "image" | "video" | "document"> = {
  IMAGE: "image",
  VIDEO: "video",
  DOCUMENT: "document",
}

function fileNameOf(url: string) {
  return decodeURIComponent(url.split("?")[0]!.split("/").pop() ?? "file")
}

function MediaThumb({ kind, url, name }: { kind: "image" | "video" | "document"; url: string; name: string }) {
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="aspect-square w-full object-cover" />
  }
  if (kind === "video") {
    return <video src={url} muted preload="metadata" className="aspect-square w-full bg-black object-cover" />
  }
  return (
    <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-muted p-1 text-center">
      <FileText className="h-6 w-6 text-red-500" />
      <span className="line-clamp-2 break-all text-[10px] leading-tight text-muted-foreground">{name}</span>
    </span>
  )
}

/** A template's header in the list: its photo, a frame of its video, or a document icon. */
function TemplateThumb({ template }: { template: TemplateOption }) {
  const kind = MEDIA_KIND[template.headerType ?? ""]
  const url = template.headerMediaUrl
  const box = "h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted"
  if (kind === "image" && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" loading="lazy" className={`${box} object-cover`} />
  }
  if (kind === "video" && url) {
    return (
      <span className={`${box} relative`}>
        <video src={url} muted preload="metadata" className="h-full w-full object-cover" />
        <PlayCircle className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" />
      </span>
    )
  }
  if (kind === "document") {
    return (
      <span className={`${box} flex items-center justify-center`}>
        <FileText className="h-5 w-5 text-red-500" />
      </span>
    )
  }
  return (
    <span className={`${box} flex items-center justify-center`}>
      <MessageCircle className="h-5 w-5 text-muted-foreground" />
    </span>
  )
}

interface CtaButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"
  text: string
  url?: string
  phoneNumber?: string
}

/**
 * Pick an approved template, fill its {{n}} placeholders and see the message
 * as it will arrive, then send. Two ways in:
 * - "New message" on the list: a number that may not be in the CRM yet.
 * - "Template" inside an open chat: `contact` is fixed, so the number fields
 *   go away and it goes to that exact contact.
 */
function TemplateSendDialog({
  open,
  onOpenChange,
  onSent,
  contact,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent: (conversationId: string | null) => void | Promise<void>
  contact?: { id: string; name: string | null; phone: string | null }
}) {
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null)
  const [search, setSearch] = useState("")
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [asLead, setAsLead] = useState(false)
  const [templateKey, setTemplateKey] = useState("")
  const [values, setValues] = useState<Record<string, string>>({})
  const [buttonValue, setButtonValue] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        // Only approved WhatsApp templates can open a conversation, so don't
        // offer drafts that would fail at the Graph API with an opaque error.
        setTemplates(
          (data.templates ?? []).filter(
            (t: TemplateOption) => t.channel === "whatsapp" && t.submissionStatus === "approved",
          ),
        )
      })
      .catch(() => setTemplates([]))
  }, [open])

  const selected = useMemo(
    () => templates?.find((t) => t.key === templateKey) ?? null,
    [templates, templateKey],
  )

  const shownTemplates = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return templates ?? []
    return (templates ?? []).filter((t) =>
      [t.name, t.key, t.bodyText].some((v) => (v ?? "").toLowerCase().includes(q)),
    )
  }, [templates, search])

  const variableNames = useMemo(() => {
    if (!selected || !Array.isArray(selected.variablesSchema)) return []
    return selected.variablesSchema.filter((n): n is string => typeof n === "string")
  }, [selected])

  // {{1}} maps to variablesSchema[0], and so on. Where a template never
  // declared names, fall back to numeric keys — which the send path also
  // understands positionally.
  const fields = useMemo(() => {
    if (!selected) return []
    return extractPlaceholders(selected.bodyText ?? "").map((n) => ({
      key: variableNames[n - 1] ?? String(n),
      n,
      label: variableNames[n - 1] ?? `Value ${n}`,
    }))
  }, [selected, variableNames])

  const buttons = (selected?.ctaButtons ?? []) as CtaButton[]
  // A link button ending in {{1}} needs its value at send time.
  const dynamicLink = buttons.find((b) => b.type === "URL" && /\{\{\d+\}\}/.test(b.url ?? ""))

  // Photo/video/PDF header: Meta takes the file on every send, so each send can
  // carry a different one from the Media library. Starts on the template's own.
  const mediaKind = MEDIA_KIND[selected?.headerType ?? ""] ?? null
  const [media, setMedia] = useState<MediaAsset[] | null>(null)
  const [headerMedia, setHeaderMedia] = useState<string | null>(null)
  useEffect(() => {
    setHeaderMedia(selected?.headerMediaUrl ?? null)
  }, [selected])
  useEffect(() => {
    if (!mediaKind || media) return
    fetch("/api/media")
      .then((r) => r.json())
      .then((d) => setMedia(d.assets ?? []))
      .catch(() => setMedia([]))
  }, [mediaKind, media])
  const mediaOptions = (media ?? []).filter((a) => a.assetType === mediaKind)

  // {{1}} is the person's name in almost every template, so it starts filled
  // in when we know the name.
  const choose = (key: string) => {
    setTemplateKey(key)
    setButtonValue("")
    const t = templates?.find((x) => x.key === key)
    const names = Array.isArray(t?.variablesSchema) ? (t?.variablesSchema as string[]) : []
    const known = contact?.name?.trim() || name.trim()
    const first = names[0] ?? "1"
    setValues(known && extractPlaceholders(t?.bodyText ?? "").includes(1) ? { [first]: known } : {})
  }

  const fill = (text: string | null | undefined) =>
    (text ?? "").replace(/\{\{(\d+)\}\}/g, (match, n: string) => {
      const key = variableNames[Number(n) - 1] ?? n
      return values[key]?.trim() || match
    })

  const reset = () => {
    setPhone("")
    setName("")
    setAsLead(false)
    setTemplateKey("")
    setValues({})
    setButtonValue("")
    setSearch("")
    setError(null)
  }

  const close = () => {
    reset()
    onOpenChange(false)
  }

  const missing =
    fields.filter((f) => !values[f.key]?.trim()).length +
    (dynamicLink && !buttonValue.trim() ? 1 : 0) +
    // Meta refuses a media-header template sent without its file.
    (mediaKind && !headerMedia ? 1 : 0)

  const handleSend = async () => {
    setSending(true)
    setError(null)
    try {
      const res = await fetch("/api/conversations/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(contact ? { contactId: contact.id } : { phone, name, asLead }),
          templateKey,
          variables: values,
          ...(dynamicLink ? { buttonParameters: [buttonValue] } : {}),
          // Only when it differs: the template's own file needs no override.
          ...(mediaKind && headerMedia && headerMedia !== selected?.headerMediaUrl ? { headerMediaUrl: headerMedia } : {}),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "Failed to send message")
        toast.error(data?.error ?? "Failed to send message")
        return
      }

      await onSent(data.conversationId ?? null)

      // A send Meta rejected still logs a row and returns 200, so report the
      // real outcome instead of treating any 200 as success.
      if (data.status === "sent") {
        toast.success("Template sent")
        close()
      } else {
        setError(data.error ?? `Message logged as "${data.status}" — open the thread for details`)
        toast.error(data.error ?? `Message logged as "${data.status}"`)
      }
    } catch {
      setError("Failed to send message")
      toast.error("Failed to send message")
    } finally {
      setSending(false)
    }
  }

  const canSend = (!!contact || phone.trim().length > 0) && !!selected && missing === 0 && !sending

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="flex h-[88svh] max-h-[88svh] flex-col gap-0 p-0 sm:max-w-6xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{contact ? "Send a template" : "New message"}</DialogTitle>
          {contact && (
            <p className="text-xs text-muted-foreground">
              To {contact.name?.trim() || formatPhone(contact.phone)}
              {contact.name?.trim() && contact.phone ? ` · ${formatPhone(contact.phone)}` : ""}
            </p>
          )}
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:overflow-hidden">
          {/* Left: who, which template, its values */}
          <div className="flex min-h-0 flex-col gap-3 border-border p-5 md:overflow-y-auto md:border-r">
            {!contact && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone number</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    inputMode="tel"
                    className={inputClass}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    10 digits assumes +91. Include the country code for anything else.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Name <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Only used when this number is new"
                    className={inputClass}
                  />
                  <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={asLead}
                      onChange={(e) => setAsLead(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Add to Leads — tick only if this person enquired (called, walked in). Otherwise they are kept
                      as audience and become a lead if they reply.
                    </span>
                  </label>
                </div>
              </>
            )}

            {!selected ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <label className="block text-xs font-medium text-muted-foreground">Template</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus={!!contact}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search templates"
                    className={`${inputClass} pl-8`}
                  />
                </div>
                <div className="min-h-64 flex-1 divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {templates === null ? (
                    <div className="flex justify-center py-6">
                      <PredictSpinner className="size-5" />
                    </div>
                  ) : shownTemplates.length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">
                      {templates.length === 0
                        ? "No approved WhatsApp templates yet — submit one and wait for Meta to approve it."
                        : `No template matches “${search}”.`}
                    </p>
                  ) : (
                    shownTemplates.map((t) => (
                      <Button
                        key={t.id}
                        type="button"
                        onClick={() => choose(t.key)}
                        variant="ghost"
                        className="flex h-auto w-full items-start justify-start gap-3 rounded-none px-3 py-2.5 whitespace-normal text-left"
                      >
                        <TemplateThumb template={t} />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium">{t.name}</span>
                          <span className="line-clamp-2 text-xs font-normal text-muted-foreground">{t.bodyText}</span>
                        </span>
                      </Button>
                    ))
                  )}
                </div>
              </div>
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

                {fields.length === 0 && !dynamicLink && (
                  <p className="text-xs text-muted-foreground">This template has nothing to fill in.</p>
                )}
                {fields.map((f) => (
                  <div key={f.key}>
                    <label className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <span className="capitalize">{f.label}</span>
                      <span className="font-mono text-[10px]">{`{{${f.n}}}`}</span>
                    </label>
                    <input
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                ))}
                {mediaKind && (
                  <div>
                    <label className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
                      <span>
                        {mediaKind === "image" ? "Photo" : mediaKind === "video" ? "Video" : "PDF / document"} to send
                      </span>
                      <a href="/stock" target="_blank" className="text-primary hover:underline">
                        Upload in Media
                      </a>
                    </label>
                    {media === null ? (
                      <div className="flex justify-center py-4">
                        <PredictSpinner className="size-5" />
                      </div>
                    ) : mediaOptions.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No {mediaKind === "document" ? "documents" : `${mediaKind}s`} in the Media library yet.
                        {selected.headerMediaUrl ? " The template's own file will be sent." : ""}
                      </p>
                    ) : (
                      <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto rounded-md border border-border p-2">
                        {mediaOptions.map((a) => {
                          const on = headerMedia === a.url
                          return (
                            <Button
                              key={a.id}
                              type="button"
                              onClick={() => setHeaderMedia(a.url)}
                              title={a.fileName}
                              variant="outline"
                              className={`relative h-auto w-full overflow-hidden rounded-md p-0 ${
                                on ? "border-primary" : "border-transparent"
                              }`}
                            >
                              <MediaThumb kind={mediaKind} url={a.url} name={a.fileName} />
                              {a.url === selected.headerMediaUrl && (
                                <span className="absolute left-1 top-1 rounded bg-background/90 px-1 text-[9px] font-medium">
                                  Default
                                </span>
                              )}
                            </Button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                {dynamicLink && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      “{dynamicLink.text}” button — value for the end of {dynamicLink.url}
                    </label>
                    <input
                      value={buttonValue}
                      onChange={(e) => setButtonValue(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: the message as it will arrive */}
          <div className="flex min-h-0 flex-col gap-2 bg-muted/30 p-5 md:overflow-y-auto">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            {!selected ? (
              <p className="py-10 text-center text-xs text-muted-foreground">Pick a template to see it here.</p>
            ) : (
              <WhatsAppPreview
                form={
                  {
                    ...({} as TemplateFormState),
                    headerType: (selected.headerType ?? "NONE") as TemplateFormState["headerType"],
                    headerText: fill(selected.headerText),
                    headerMediaUrl: headerMedia ?? "",
                    bodyText: fill(selected.bodyText),
                    bodyExamples: [],
                    footerText: selected.footerText ?? "",
                    ctaButtons: buttons as TemplateFormState["ctaButtons"],
                  } as TemplateFormState
                }
                placeholders={extractPlaceholders(fill(selected.bodyText))}
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="min-w-0 text-xs">
            {error ? (
              <span className="text-red-600">{error}</span>
            ) : selected && missing > 0 ? (
              <span className="text-muted-foreground">
                {missing} value{missing === 1 ? "" : "s"} left to fill
              </span>
            ) : null}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSend} disabled={!canSend}>
              {sending ? <PredictSpinner className="size-4" /> : <Send />}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
