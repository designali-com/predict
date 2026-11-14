//@ts-nocheck
"use client"

import { useEffect, useRef, useState } from "react"
import { NeuroNoise } from "@paper-design/shaders-react"
import { Button } from "@workspace/ui/components/button"
import Link from "next/link"


// ============================================================================
// CONFIG
// ============================================================================

/** Frames in each set under public/frames — the light render came out shorter. */
const FRAME_COUNT = { dark: 544, light: 528 } as const
const SCROLL_HEIGHT = 800
const INITIAL_FRAMES = 40
const BATCH_SIZE = 25

/**
 * The purple noise behind the opening headline, capped.
 *
 * Left alone the shader renders up to 1920 × 1080 × 4 pixels every frame — it
 * scales with device pixel ratio, so a retina laptop pays for all of them. The
 * noise is soft by nature and has no fine detail to lose, so drawing it at the
 * same resolution as the hero frames and letting the browser scale it up looks
 * the same at a fraction of the GPU work. That work was what made the page feel
 * sluggish before anyone had scrolled.
 */
const NOISE_MAX_PIXELS = 1600 * 900

const frameSrc = (index: number, theme: "dark" | "light") =>
  `/frames/${theme}/frame-${String(index + 1).padStart(4, "0")}.webp`

// ============================================================================
// RESPONSIVE SCENE CONFIGS
// ============================================================================

const SCENES_DESKTOP = [
  { id: 0, fadeInStart: -0.1, fadeInEnd: 0.0, fadeOutStart: 0.0, fadeOutEnd: 0.02 },
  { id: 1, fadeInStart: 0.03, fadeInEnd: 0.05, fadeOutStart: 0.10, fadeOutEnd: 0.12 },
  { id: 2, fadeInStart: 0.12, fadeInEnd: 0.14, fadeOutStart: 0.22, fadeOutEnd: 0.24 },
  { id: 3, fadeInStart: 0.30, fadeInEnd: 0.32, fadeOutStart: 0.42, fadeOutEnd: 0.44 },
  { id: 4, fadeInStart: 0.60, fadeInEnd: 0.62, fadeOutStart: 0.68, fadeOutEnd: 0.70 },
  { id: 5, fadeInStart: 0.76, fadeInEnd: 0.78, fadeOutStart: 0.82, fadeOutEnd: 0.84 },
  { id: 6, fadeInStart: 0.86, fadeInEnd: 0.88, fadeOutStart: 0.92, fadeOutEnd: 0.94 },
  { id: 7, fadeInStart: 0.90, fadeInEnd: 1.02, fadeOutStart: 1.08, fadeOutEnd: 1.10 },
]

// Mobile timing adjusted for faster scroll passes and smaller viewport travel
const SCENES_MOBILE = [
  { id: 0, fadeInStart: -0.1, fadeInEnd: 0.0, fadeOutStart: 0.0, fadeOutEnd: 0.02 },
  { id: 1, fadeInStart: 0.03, fadeInEnd: 0.05, fadeOutStart: 0.11, fadeOutEnd: 0.13 },
  { id: 2, fadeInStart: 0.14, fadeInEnd: 0.16, fadeOutStart: 0.23, fadeOutEnd: 0.25 },
  { id: 3, fadeInStart: 0.28, fadeInEnd: 0.30, fadeOutStart: 0.44, fadeOutEnd: 0.46 },
  { id: 4, fadeInStart: 0.54, fadeInEnd: 0.56, fadeOutStart: 0.62, fadeOutEnd: 0.64 },
  { id: 5, fadeInStart: 0.66, fadeInEnd: 0.68, fadeOutStart: 0.78, fadeOutEnd: 0.80 },
  { id: 6, fadeInStart: 0.82, fadeInEnd: 0.84, fadeOutStart: 0.92, fadeOutEnd: 0.94 },
  { id: 7, fadeInStart: 0.95, fadeInEnd: 0.98, fadeOutStart: 1.05, fadeOutEnd: 1.08 },
]

// ============================================================================
// HELPERS
// ============================================================================

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function interpolate(value: number, start: number, end: number, from: number, to: number) {
  if (start === end) return to
  const progress = clamp((value - start) / (end - start))
  return from + (to - from) * progress
}

/** How visible a scene is at a given scroll position. */
function sceneOpacityAt(sceneIndex: number, progress: number, mobile: boolean) {
  const scene = (mobile ? SCENES_MOBILE : SCENES_DESKTOP)[sceneIndex]
  if (!scene) return 0
  const fadeIn = interpolate(progress, scene.fadeInStart, scene.fadeInEnd, 0, 1)
  const fadeOut = interpolate(progress, scene.fadeOutStart, scene.fadeOutEnd, 1, 0)
  return Math.min(fadeIn, fadeOut)
}

/**
 * The scene styles for the top of the page, for the first paint.
 *
 * Mobile and desktop agree at progress 0 — the headline is fully visible and
 * everything else is hidden — so the server and the client render the same
 * thing and nothing flickers while the scroll handler wakes up.
 */
const START = (sceneIndex: number) => ({ opacity: sceneOpacityAt(sceneIndex, 0, false) })

// ============================================================================
// HERO SECTION
// ============================================================================

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Read straight away on the client, so a light page does not first fetch and flash the dark frames.
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    typeof document !== "undefined" && !document.documentElement.classList.contains("dark") ? "light" : "dark",
  )
  /**
   * Whether the noise shader is mounted at all.
   *
   * The only piece of scroll state that still goes through React, because it
   * is the only one that changes what exists rather than how it looks — and it
   * flips twice per visit, not sixty times a second. The shader pauses itself
   * when it leaves the viewport, but it never does here: it lives in a sticky
   * box that stays on screen for the whole 800vh scroll, so at opacity 0 it
   * kept rendering every frame for as long as anyone read the page.
   */
  const [showNoise, setShowNoise] = useState(true)

  // Mirrors of state the scroll handler reads. The handler is registered once
  // and would otherwise see the values from the first render forever.
  const isMobileRef = useRef(false)

  // Device detection
  useEffect(() => {
    // A ref, not state: nothing renders differently on mobile, only the scroll
    // timings change, and those are read inside the scroll handler.
    const checkMobile = () => {
      isMobileRef.current = window.innerWidth < 768
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Theme Detection — the site's theme, not the device's.
  //
  // The theme provider marks dark with a "dark" class on <html> and light by
  // its absence; it never adds a "light" class. Reading the device setting when
  // neither class was there meant a phone in dark mode kept the black frames
  // after the reader switched the site to light — black text on black. The
  // class is the answer either way (the provider applies the device setting to
  // it when the choice is "system"), so it is all this reads.
  useEffect(() => {
    const current = (): "dark" | "light" => (document.documentElement.classList.contains("dark") ? "dark" : "light")
    setTheme(current())

    const observer = new MutationObserver(() => setTheme(current()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  // Frame Engine
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let cancelled = false
    let rafId = 0
    let scrollRafId = 0
    let targetFrame = 0
    let currentFrame = 0
    let renderedFrame = -1
    let scrollScheduled = false
    /** Whether the easing loop is currently scheduled. */
    let running = false
    let noiseMounted = true

    // Only frames that exist: asking for the dark set's extra ones in light was 16 404s a visit.
    const TOTAL_FRAMES = FRAME_COUNT[theme]
    const frames: Array<HTMLImageElement | null> = new Array(TOTAL_FRAMES).fill(null)

    /**
     * Every scene element, found once.
     *
     * Opacity used to be React state set on every scroll frame, which
     * re-rendered the entire hero — all eight scenes and the shader's wrapper —
     * sixty times a second while scrolling. Writing the style straight to the
     * element does the same visual work without React in the loop at all.
     */
    const sceneEls = Array.from(container.querySelectorAll<HTMLElement>("[data-scene]"))

    function resizeCanvas() {
      const width = window.innerWidth
      const height = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      renderedFrame = -1
    }

    resizeCanvas()

    function getLoadedFrame(index: number): HTMLImageElement | null {
      const safeIndex = Math.round(clamp(index, 0, TOTAL_FRAMES - 1))
      const exact = frames[safeIndex]
      if (exact && exact.complete && exact.naturalWidth > 0) return exact

      for (let distance = 1; distance < TOTAL_FRAMES; distance++) {
        const left = safeIndex - distance
        const right = safeIndex + distance
        if (left >= 0 && frames[left]?.complete && frames[left]!.naturalWidth > 0) return frames[left]
        if (right < TOTAL_FRAMES && frames[right]?.complete && frames[right]!.naturalWidth > 0) return frames[right]
      }
      return null
    }

    function drawFrame(frameIndex: number) {
      const index = Math.round(clamp(frameIndex, 0, TOTAL_FRAMES - 1))
      if (index === renderedFrame) return

      const image = getLoadedFrame(index)
      if (!image) return

      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const imageWidth = image.naturalWidth
      const imageHeight = image.naturalHeight

      if (!imageWidth || !imageHeight) return

      const scale = Math.max(viewportWidth / imageWidth, viewportHeight / imageHeight)
      const width = imageWidth * scale
      const height = imageHeight * scale
      const x = (viewportWidth - width) / 2
      const y = (viewportHeight - height) / 2

      ctx.clearRect(0, 0, viewportWidth, viewportHeight)
      ctx.drawImage(image, x, y, width, height)
      renderedFrame = index
    }

    /**
     * Ease the drawn frame toward the scroll position, then stop.
     *
     * This loop used to reschedule itself forever, so the page ran a
     * sixty-frames-a-second callback for the whole visit even while nobody was
     * touching it. It now runs only while the frame is still catching up and
     * is woken again by the next scroll.
     */
    function animate() {
      if (cancelled) {
        running = false
        return
      }
      const difference = targetFrame - currentFrame
      if (Math.abs(difference) > 0.01) {
        currentFrame += difference * 0.2
        drawFrame(currentFrame)
        rafId = requestAnimationFrame(animate)
      } else {
        currentFrame = targetFrame
        drawFrame(currentFrame)
        running = false
      }
    }

    function wake() {
      if (running || cancelled) return
      running = true
      rafId = requestAnimationFrame(animate)
    }

    function applyScenes(progress: number) {
      const mobile = isMobileRef.current
      for (const el of sceneEls) {
        const opacity = sceneOpacityAt(Number(el.dataset.scene), progress, mobile)
        el.style.opacity = String(opacity)
        if (el.dataset.interactive !== undefined) {
          el.style.pointerEvents = opacity > 0.5 ? "auto" : "none"
        }
        if (el.dataset.lift !== undefined) {
          el.style.transform = `translateY(${interpolate(progress, 0, 0.02, 0, -20)}px)`
        }
      }

      // Unmount the shader once the opening scene has fully faded, and bring it
      // back if the reader scrolls up to the top again. Only calls into React
      // when the answer actually changes.
      const noiseVisible = sceneOpacityAt(0, progress, mobile) > 0
      if (noiseVisible !== noiseMounted) {
        noiseMounted = noiseVisible
        setShowNoise(noiseVisible)
      }
    }

    function updateScroll() {
      scrollScheduled = false
      if (cancelled) return

      const rect = container.getBoundingClientRect()
      const totalScroll = container.offsetHeight - window.innerHeight
      if (totalScroll <= 0) return

      const passed = -rect.top
      const progress = clamp(passed / totalScroll)

      targetFrame = progress * (TOTAL_FRAMES - 1)
      applyScenes(progress)
      wake()
    }

    function handleScroll() {
      if (scrollScheduled) return
      scrollScheduled = true
      scrollRafId = requestAnimationFrame(updateScroll)
    }

    function handleResize() {
      resizeCanvas()
      drawFrame(currentFrame)
      // The mobile and desktop timings differ, so a resize across the
      // breakpoint has to re-place the scenes for the current position.
      updateScroll()
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("resize", handleResize)

    function loadFrame(index: number) {
      return new Promise<void>((resolve) => {
        const image = new Image()
        image.decoding = "async"
        image.onload = () => {
          if (!cancelled) frames[index] = image
          resolve()
        }
        image.onerror = () => resolve()
        image.src = frameSrc(index, theme)
      })
    }

    // Scenes are placed immediately, from wherever the page was opened — a
    // reload halfway down should not flash the opening headline first.
    updateScroll()

    Promise.all(
      Array.from({ length: Math.min(INITIAL_FRAMES, TOTAL_FRAMES) }, (_, index) =>
        loadFrame(index)
      )
    ).then(() => {
      if (cancelled) return
      drawFrame(currentFrame)
      updateScroll()

      ;(async () => {
        for (let start = INITIAL_FRAMES; start < TOTAL_FRAMES; start += BATCH_SIZE) {
          if (cancelled) return
          const end = Math.min(start + BATCH_SIZE, TOTAL_FRAMES)
          await Promise.all(
            Array.from({ length: end - start }, (_, offset) => loadFrame(start + offset))
          )
          // A frame drawn from a neighbour while its own image was still
          // loading would otherwise stay until the next scroll. With the loop no
          // longer running forever nothing else redraws it, so do it here.
          if (cancelled) return
          renderedFrame = -1
          drawFrame(currentFrame)
        }
      })()
    })

    return () => {
      cancelled = true
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", handleResize)
      cancelAnimationFrame(rafId)
      cancelAnimationFrame(scrollRafId)

      frames.forEach((image) => {
        if (image) {
          image.onload = null
          image.onerror = null
          image.src = ""
        }
      })
    }
  }, [theme])

  return (
    <section ref={containerRef} className="relative w-full" style={{ height: `${SCROLL_HEIGHT}vh` }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 z-10 h-full w-full"
          style={{ display: "block", transform: "translateZ(0)" }}
        />

        {/* Hero Background Noise.
            No CSS opacity transition on these scene layers: their opacity is
            written every scroll frame, and a transition on top made each fade
            trail behind the scroll instead of tracking it. */}
        <div
          data-scene="0"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          style={START(0)}
        >
          {showNoise && (
            <NeuroNoise
              className="absolute top-0 h-full w-full"
              colorFront="#ffffff"
              colorMid="#8606fe"
              colorBack="#00000000"
              brightness={0.015}
              contrast={1}
              speed={0.3}
              maxPixelCount={NOISE_MAX_PIXELS}
              minPixelRatio={1}
            />
          )}
        </div>

        {/* Scene 0: Hero Text */}
        <div
          data-scene="0"
          data-interactive=""
          data-lift=""
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 px-6 text-center md:gap-6 md:px-10"
          style={{ ...START(0), pointerEvents: "auto", transform: "translateY(0px)" }}
        >
          <h1 className="text-5xl px-6 font-medium md:text-6xl">
            There is an <span className="text-primary">organ</span> <br /> that predicts everything.
          </h1>
          <p className="mx-auto max-w-60 text-xs text-muted-foreground md:max-w-xl md:text-sm">
            Not the heart. Not the brain. The one you've been training wrong or not at all.
          </p>
          <div className="fade-in slide-in-from-bottom-10 flex animate-in flex-row flex-wrap items-center justify-center gap-3 pt-2 ease-out">
            <Button nativeButton={false} render={<Link href="#waitlist" />} className="rounded-full" size="xl">
              Get early access
            </Button>
          </div>
        </div>

        {/* ============================================================================ */}
        {/* OVERLAYS (Scenes 1-6) - Responsive Placement */}
        {/* ============================================================================ */}

        <div className="pointer-events-none absolute inset-0 z-40 px-6 md:px-0">

          {/* Scene 1: Muscle Title */}
          <div
            data-scene="1"
            className="absolute top-1/4 md:top-1/5 left-1/2 -translate-x-1/2 w-full text-center"
            style={START(1)}
          >
            <p className="text-sm md:text-md text-muted-foreground">The Organ</p>
            <h2 className="text-4xl font-medium md:text-6xl">Muscle</h2>
          </div>

          {/* Scene 2: Decline */}
          <div
            data-scene="2"
            className="absolute bottom-1/5 md:bottom-1/4 left-1/2 -translate-x-1/2 w-full px-8 text-center"
            style={START(2)}
          >
            <h2 className="text-2xl md:text-4xl">
              When muscle declines <br/> everything follows.
            </h2>
          </div>

          {/* Scene 3: Chronic Disease */}
          <div
            data-scene="3"
            className="absolute top-1/4 md:top-1/5 left-1/2 -translate-x-1/2 w-full max-w-xs md:max-w-lg text-center"
            style={START(3)}
          >
            <h2 className="font-playfair text-2xl md:text-4xl">
              Most chronic disease doesn't start in the organ that fails.
            </h2>
            <p className="pt-3 md:pt-4 text-xs md:text-md text-muted-foreground">
              It starts in the muscle that stopped protecting it.
            </p>
          </div>

          <div
            data-scene="3"
            className="absolute bottom-1/4 left-1/2 -translate-x-1/2 text-center"
            style={START(3)}
          >
            <p className="text-[10px] md:text-xs uppercase tracking-wide opacity-80">Years earlier.</p>
          </div>

          {/* Scene 4: Signal */}
          <div
            data-scene="4"
            className="absolute top-1/4 md:top-1/5 left-1/2 -translate-x-1/2 w-full text-center"
            style={START(4)}
          >
            <p className="text-sm md:text-base text-muted-foreground">The Signal</p>
            <h2 className="text-4xl font-medium md:text-6xl">Blood.</h2>
          </div>

          {/* Scene 5: Data Stream */}
          <div
            data-scene="5"
            className="absolute top-1/4 md:top-1/5 left-1/2 md:left-[16.666%] -translate-x-1/2 md:translate-x-0 w-full max-w-xs md:max-w-60 text-center md:text-left"
            style={START(5)}
          >
            <h2 className="text-4xl font-medium md:text-6xl">Blood</h2>
            <p className="pt-2 text-xs md:text-base text-muted-foreground">
              A live data stream. Following through you. Right now.
            </p>
          </div>

          {/* Scene 6: Metrics */}
          <div
            data-scene="6"
            className="absolute top-1/3 md:top-1/2 left-1/2 md:left-auto md:right-[16.666%] -translate-x-1/2 md:translate-x-0 w-full max-w-xs md:w-80 text-center md:text-right"
            style={START(6)}
          >
            <h2 className="text-2xl font-medium md:text-4xl">
              Your blood carries your true age.
            </h2>
            <p className="pt-2 text-sm">Every second, it circulates signals:</p>
            <div className="space-y-1 md:space-y-2 pt-2 md:pt-3 text-sm text-muted-foreground">
              <p>• The rate of breakdown</p>
              <p>• The capacity to regenerate</p>
              <p>• The metabolic efficiency</p>
              <p>• The inflammatory burden</p>
              <p>• The vascular integrity</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
