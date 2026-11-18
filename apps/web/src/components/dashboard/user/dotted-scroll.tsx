"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

/** Pixels of scrolling per step of the light along the dots. */
const LOOP_STEP = 36

/**
 * A scroll area whose scrollbar is a short loop of dots.
 *
 * The browser's own bar is hidden (WebKit and Firefox both), and five dots
 * sit in the middle of the edge instead. As the area scrolls, the light moves
 * from dot to dot and wraps round to the first — a loop that keeps turning
 * for as long as there is scrolling, rather than a bar that says how far
 * along you are. Drawn by us rather than styled with ::-webkit-scrollbar,
 * because phones ignore that styling, and the swipeable marker cards need
 * the hint on a phone most of all.
 *
 * Nothing is drawn when the content fits.
 */
export function DottedScroll({
  axis = "y",
  className,
  wrapperClassName,
  dots = 5,
  onScroll,
  children,
}: {
  axis?: "x" | "y"
  /** On the scrolling element: give it its overflow and size here. */
  className?: string
  wrapperClassName?: string
  dots?: number
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ offset: 0, scrollable: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const total = axis === "y" ? el.scrollHeight : el.scrollWidth
    const seen = axis === "y" ? el.clientHeight : el.clientWidth
    const offset = axis === "y" ? el.scrollTop : el.scrollLeft
    const scrollable = total - seen > 1
    setView((v) => (v.offset === offset && v.scrollable === scrollable ? v : { offset, scrollable }))
  }, [axis])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    // Content arrives late (the plan is fetched) and screens get resized;
    // either changes whether there is anything to scroll.
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    const mutations = new MutationObserver(measure)
    mutations.observe(el, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      mutations.disconnect()
    }
  }, [measure])

  // Which dot is lit: one step per LOOP_STEP pixels, wrapping round.
  const lit = Math.floor(view.offset / LOOP_STEP) % dots

  return (
    <div className={cn("relative", wrapperClassName)}>
      <div
        ref={ref}
        onScroll={(e) => {
          measure()
          onScroll?.(e)
        }}
        className={cn("[scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
      >
        {children}
      </div>

      {view.scrollable && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute flex items-center gap-1.5",
            axis === "y"
              ? "top-1/2 right-2 -translate-y-1/2 flex-col"
              : "bottom-0 left-1/2 -translate-x-1/2 flex-row",
          )}
        >
          {Array.from({ length: dots }, (_, i) => {
            // The lit dot, and a softer glow on the two either side of it —
            // wrapping, so the glow follows the light round the loop.
            const distance = Math.min(Math.abs(i - lit), dots - Math.abs(i - lit))
            return (
              <span
                key={i}
                className={cn(
                  "rounded-full transition-all duration-200",
                  distance === 0
                    ? "h-1.5 w-1.5 bg-primary"
                    : distance === 1
                      ? "h-1 w-1 bg-primary/50"
                      : "h-1 w-1 bg-muted-foreground/30",
                )}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
