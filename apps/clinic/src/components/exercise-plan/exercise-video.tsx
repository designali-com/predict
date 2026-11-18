"use client"

import { useState } from "react"
import { Play, ExternalLink } from "lucide-react"

/** "https://www.youtube.com/watch?v=abc" / youtu.be / shorts / embed → "abc"; null for anything else. */
function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, "")
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.searchParams.get("v")) return u.searchParams.get("v")
      const m = /^\/(?:shorts|embed|live)\/([\w-]+)/.exec(u.pathname)
      return m?.[1] ?? null
    }
  } catch {}
  return null
}

/** "https://drive.google.com/file/d/<id>/view" (or open?id=, uc?id=) → "<id>"; null for anything else. */
function driveId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname !== "drive.google.com" && u.hostname !== "docs.google.com") return null
    const m = /\/file\/d\/([\w-]+)/.exec(u.pathname)
    return m?.[1] ?? u.searchParams.get("id")
  } catch {}
  return null
}

/**
 * The exercise's video, played right on the page. Only the thumbnail loads
 * until it is tapped — a plan of ten exercises should not pull in ten players.
 * YouTube and Google Drive play in the page (a Drive file must be shared
 * "Anyone with the link"); any other link opens in a new tab instead.
 */
export function ExerciseVideo({
  url,
  title,
  labels = { play: "Tap to play", open: "Open video" },
}: {
  url: string
  title: string
  /** In the page's language. */
  labels?: { play: string; open: string }
}) {
  const [playing, setPlaying] = useState(false)
  const [noThumb, setNoThumb] = useState(false)
  const id = youtubeId(url)
  const drive = id ? null : driveId(url)

  if (!id && !drive) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex aspect-video w-full items-center justify-center gap-2 rounded-xl bg-neutral-100 text-sm font-semibold text-[var(--brand)]"
      >
        <ExternalLink className="h-4 w-4" /> {labels.open}
      </a>
    )
  }

  if (playing) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <iframe
          src={
            drive
              ? `https://drive.google.com/file/d/${drive}/preview`
              : `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`
          }
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-neutral-900"
    >
      {!noThumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={drive ? `https://drive.google.com/thumbnail?id=${drive}&sz=w640` : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setNoThumb(true)}
          className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
        />
      )}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-lg transition-transform group-hover:scale-105">
          <Play className="ml-0.5 h-6 w-6 fill-current" />
        </span>
      </span>
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
        {labels.play}
      </span>
    </button>
  )
}
