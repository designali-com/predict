"use client"

import { Bot, Download, FileText, Loader2, MapPin, Mic, TriangleAlert } from "lucide-react"

/** Clinic record chrome: white card, hairline, small tracking label. */
export const waCard =
  "overflow-hidden rounded-md border border-black/18 bg-white shadow-sm dark:border-white/10 dark:bg-black"

export const waPanel = `flex min-h-0 flex-col ${waCard}`

export const waRule = "border-black/12 dark:border-white/5"

export const waMuted = "text-black/60 dark:text-white/40"

export const waLog =
  "min-h-0 flex-1 overflow-y-auto bg-black/[0.02] px-3 py-4 sm:px-5 dark:bg-white/[0.03]"

export const waInput =
  "max-h-32 min-h-10 flex-1 resize-none rounded-[20px] border border-black/18 bg-white px-4 py-2.5 leading-5 text-sm text-black focus:border-black/40 focus:outline-none dark:border-white/15 dark:bg-black dark:text-white"

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  // Never reached the patient: refused by Meta (template, parameters) or held
  // back after acceptance (131049, the marketing cap). Showing "Sent" here hid
  // weeks of check-ins that never arrived, so the thread says what happened.
  failed: "Not delivered",
  skipped_no_consent: "Not sent — no consent",
}

export interface WaMessage {
  id: string
  direction: string
  body: string | null
  status: string
  createdAt: string
  aiGenerated?: boolean
  variables?: Record<string, unknown> | null
  /** A photo, video, voice note, document or sticker — see lib/message-media.ts. */
  media?: {
    kind: "image" | "video" | "audio" | "document" | "sticker" | "reaction" | "location" | "contact"
    url?: string
    mime?: string
    name?: string
    voice?: boolean
    emoji?: string
    mapUrl?: string
    /** A GIF — WhatsApp sends them as silent mp4s. */
    gif?: boolean
    pending?: boolean
    error?: string
  } | null
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((startOfDay(new Date()) - startOfDay(d)) / 86_400_000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}

function messageText(m: WaMessage) {
  if (m.body?.trim()) return m.body
  // A photo or file with no caption needs no text under it.
  if (m.media) return ""
  const values = Object.entries(m.variables ?? {})
    .filter(([k, v]) => k !== "media" && v != null && typeof v !== "object" && String(v).trim())
    .map(([, v]) => v)
  return values.length ? values.join(" · ") : "—"
}

/** The photo, video, voice note, document or sticker in a bubble. */
function BubbleMedia({ media, out }: { media: NonNullable<WaMessage["media"]>; out: boolean }) {
  const soft = out ? "bg-primary-foreground/10" : "bg-black/[0.04] dark:bg-white/[0.06]"
  if (media.kind === "reaction" || media.kind === "contact") return null
  if (media.kind === "location") {
    return media.mapUrl ? (
      <a href={media.mapUrl} target="_blank" rel="noreferrer" className={`mb-1 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs underline ${soft}`}>
        <MapPin className="h-3.5 w-3.5" /> Open in Maps
      </a>
    ) : null
  }
  if (media.pending) {
    return (
      <div className={`mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${soft}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading {media.kind}…
      </div>
    )
  }
  if (!media.url) {
    return (
      <div className={`mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${soft}`}>
        <TriangleAlert className="h-3.5 w-3.5" /> {media.kind === "document" ? "Document" : media.kind} could not be loaded
      </div>
    )
  }
  if (media.kind === "image") {
    return (
      <a href={media.url} target="_blank" rel="noreferrer" className="-mx-1 -mt-0.5 mb-1 block overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.url} alt="" loading="lazy" className="max-h-72 w-full max-w-xs object-cover" />
      </a>
    )
  }
  if (media.kind === "sticker") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={media.url} alt="Sticker" loading="lazy" className="mb-1 h-32 w-32 object-contain" />
    )
  }
  if (media.kind === "video" && media.gif) {
    // A GIF arrives as a silent mp4: it loops on its own, like in WhatsApp, with no player controls.
    return (
      <div className="relative -mx-1 -mt-0.5 mb-1 w-fit max-w-xs overflow-hidden rounded-xl">
        <video src={media.url} autoPlay loop muted playsInline preload="auto" className="max-h-72 w-full" />
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">GIF</span>
      </div>
    )
  }
  if (media.kind === "video") {
    return (
      <video src={media.url} controls playsInline preload="metadata" className="-mx-1 -mt-0.5 mb-1 max-h-72 w-full max-w-xs rounded-xl bg-black" />
    )
  }
  if (media.kind === "audio") {
    return (
      <div className="mb-1 flex items-center gap-2">
        {media.voice && <Mic className="h-4 w-4 shrink-0 opacity-70" />}
        <audio src={media.url} controls preload="metadata" className="h-9 w-60 max-w-full" />
      </div>
    )
  }
  return (
    <a href={media.url} target="_blank" rel="noreferrer" className={`mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2.5 ${soft}`}>
      <FileText className="h-6 w-6 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{media.name || "Document"}</span>
        <span className="block text-[10px] opacity-70">{(media.mime ?? "").split("/")[1]?.toUpperCase() || "File"} · open</span>
      </span>
      <Download className="h-4 w-4 shrink-0 opacity-70" />
    </a>
  )
}

/** The thread itself: day chips and bubbles, the same on the inbox and the lead Chat tab. */
export function WhatsAppBubbles({ messages }: { messages: WaMessage[] }) {
  if (messages.length === 0) {
    return <p className={`py-10 text-center text-sm ${waMuted}`}>No messages yet.</p>
  }

  return (
    <div className="flex flex-col gap-1.5">
      {messages.map((m, i) => {
        const out = m.direction === "outbound"
        const newDay = i === 0 || dayLabel(messages[i - 1]!.createdAt) !== dayLabel(m.createdAt)
        return (
          <div key={m.id} className="contents">
            {newDay && (
              <div className="my-2 flex justify-center">
                <span className="rounded-full border border-black/12 bg-white px-3 py-0.5 text-[11px] text-black/60 shadow-sm dark:border-white/10 dark:bg-black dark:text-white/40">
                  {dayLabel(m.createdAt)}
                </span>
              </div>
            )}
            <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm md:max-w-[70%] ${
                  out
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-black/18 bg-white text-black dark:border-white/10 dark:bg-black dark:text-white"
                }`}
              >
                {m.media && <BubbleMedia media={m.media} out={out} />}
                {m.media?.kind === "reaction" ? (
                  <p className="text-2xl leading-none">{m.media.emoji || "—"}</p>
                ) : (
                  messageText(m) && <p className="whitespace-pre-wrap break-words">{messageText(m)}</p>
                )}
                <p
                  className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                    out ? "text-primary-foreground/75" : waMuted
                  }`}
                >
                  {m.aiGenerated && (
                    <span className="flex items-center gap-0.5">
                      <Bot className="h-3 w-3" /> AI ·
                    </span>
                  )}
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {out && (
                    <span
                      className={m.status === "read" ? "font-semibold" : m.status === "failed" ? "font-semibold text-[#E62A3B]" : ""}
                    >
                      · {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
