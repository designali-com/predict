"use client"

import * as React from "react"
import {
  CheckIcon,
  ClipboardIcon,
  Code2Icon,
  DownloadIcon,
  ImageIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import { Logo, LogoIcon, PredictLogo, PredictMascut } from "@workspace/ui/predict/logo"
import { PredictMascot } from "@workspace/ui/predict/predict-mascot"

/* =========================================================
   BRAND VALUES
========================================================= */

const INK = "#000000"
const PAPER = "#FFFFFF"
const PURPLE = "#8504FE"

type Tone = "light" | "dark"

/* =========================================================
   SVG EXPORT
========================================================= */

/**
 * Turns a rendered logo into a standalone SVG. `currentColor` and the theme
 * classes are replaced with real colours for the chosen background, and the
 * size is set from the viewBox so the file opens at its natural size.
 */
function serializeSvg(element: SVGSVGElement, tone: Tone) {
  const ink = tone === "light" ? INK : PAPER
  const paper = tone === "light" ? PAPER : INK
  const clone = element.cloneNode(true) as SVGSVGElement

  for (const attr of ["class", "style", "role", "aria-label", "aria-hidden"]) {
    clone.removeAttribute(attr)
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")

  const viewBox = clone.getAttribute("viewBox")?.split(/[\s,]+/).map(Number)
  if (viewBox?.length === 4) {
    clone.setAttribute("width", String(viewBox[2]))
    clone.setAttribute("height", String(viewBox[3]))
  }

  for (const node of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    const el = node as SVGElement
    const className = el.getAttribute("class") ?? ""

    if (el.getAttribute("fill") === "currentColor") el.setAttribute("fill", ink)
    if (el.getAttribute("stroke") === "currentColor") el.setAttribute("stroke", ink)
    if (className.includes("fill-background")) el.setAttribute("fill", paper)
    if (className.includes("fill-foreground")) el.setAttribute("fill", ink)
    if (className.includes("fill-primary")) el.setAttribute("fill", PURPLE)
    el.removeAttribute("class")
  }

  return new XMLSerializer().serializeToString(clone).replace(/>\s+</g, "><")
}

function download(href: string, filename: string) {
  const link = document.createElement("a")
  link.href = href
  link.download = filename
  link.click()
}

function downloadSvg(svg: string, filename: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }))
  download(url, filename)
  window.setTimeout(() => URL.revokeObjectURL(url), 100)
}

/** Renders the SVG onto a canvas with its longest side at `size` pixels. */
function downloadPng(svg: string, filename: string, size = 2048) {
  const image = new Image()
  image.onload = () => {
    const scale = size / Math.max(image.width, image.height)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height)
    download(canvas.toDataURL("image/png"), filename)
  }
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function useCopied() {
  const [copied, setCopied] = React.useState(false)

  const copy = React.useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked, such as in an insecure context.
    }
  }, [])

  return { copied, copy }
}

/* =========================================================
   SHARED PIECES
========================================================= */

// Theme variables scoped to a fixed background, so theme classes inside a
// preview (like the mascot's fill-background eyes) match it in both modes.
const surfaceVars: Partial<Record<string, React.CSSProperties>> = {
  light: { "--background": PAPER, "--foreground": INK } as React.CSSProperties,
  dark: { "--background": INK, "--foreground": PAPER } as React.CSSProperties,
}

function Surface({
  tone = "light",
  className,
  style,
  ...props
}: React.ComponentProps<"div"> & { tone?: Tone | "brand" | "muted" }) {
  return (
    <div
      style={{ ...surfaceVars[tone], ...style }}
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-lg border",
        tone === "light" && "bg-white text-black",
        tone === "dark" && "border-neutral-800 bg-black text-white",
        tone === "brand" && "border-transparent bg-[#8504FE] text-white",
        tone === "muted" && "bg-muted/40",
        className
      )}
      {...props}
    />
  )
}

function Verdict({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <figcaption className="flex items-start gap-2 pt-3 text-xs">
      <span
        className={cn(
          "mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-white",
          ok ? "bg-status-normal" : "bg-status-extreme"
        )}
      >
        {ok ? <CheckIcon className="size-3" /> : <XIcon className="size-3" />}
      </span>
      <span className="text-muted-foreground">{children}</span>
    </figcaption>
  )
}

/* =========================================================
   LOGO ASSETS
========================================================= */

type Asset = {
  id: string
  name: string
  description: string
  render: (tone: Tone) => React.ReactNode
}

const assets: Asset[] = [
  {
    id: "predict-logo",
    name: "Logo",
    description: "Wordmark with the mark. The default for headers, documents, and partners.",
    render: () => <Logo className="h-12 size-40" />,
  },
  {
    id: "predict-icon",
    name: "Icon",
    description: "The mark on its own. For app icons, favicons, and avatars.",
    render: () => <LogoIcon className="size-20" />,
  },
  {
    id: "predict-wordmark",
    name: "Wordmark",
    description: "The detailed wordmark for covers, signage, and hero sections.",
    render: () => <PredictLogo className="h-12 size-40" />,
  },
  {
    id: "predict-mascot",
    name: "Mascot",
    description: "The still mascot. For print, email, and anywhere motion isn't possible.",
    render: () => <PredictMascut className="h-36 w-auto" />,
  },
]

function AssetCard({ asset }: { asset: Asset }) {
  const [tone, setTone] = React.useState<Tone>("light")
  const [showCode, setShowCode] = React.useState(false)
  const [svg, setSvg] = React.useState("")
  const previewRef = React.useRef<HTMLDivElement>(null)
  const { copied, copy } = useCopied()

  // Re-serialize after each render so the SVG always matches the preview.
  React.useEffect(() => {
    const element = previewRef.current?.querySelector("svg")
    if (element) setSvg(serializeSvg(element, tone))
  }, [tone])

  const filename = `${asset.id}-${tone === "light" ? "black" : "white"}`

  return (
    <Card className="pt-0">
      <Surface ref={previewRef} tone={tone} className="h-64 rounded-b-none border-0 border-b p-10">
        {asset.render(tone)}
      </Surface>

      <CardHeader>
        <CardTitle className="text-sm">{asset.name}</CardTitle>
        <CardDescription>{asset.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={tone} onValueChange={(value) => setTone(value as Tone)}>
            <TabsList>
              <TabsTrigger value="light">On light</TabsTrigger>
              <TabsTrigger value="dark">On dark</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCode((value) => !value)}
            aria-expanded={showCode}
          >
            <Code2Icon data-icon="inline-start" />
            {showCode ? "Hide SVG" : "View SVG"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!svg} onClick={() => downloadSvg(svg, `${filename}.svg`)}>
            <DownloadIcon data-icon="inline-start" />
            SVG
          </Button>
          <Button variant="outline" size="sm" disabled={!svg} onClick={() => downloadPng(svg, `${filename}.png`)}>
            <ImageIcon data-icon="inline-start" />
            PNG
          </Button>
          <Button variant="outline" size="sm" disabled={!svg} onClick={() => copy(svg)}>
            {copied ? <CheckIcon data-icon="inline-start" /> : <ClipboardIcon data-icon="inline-start" />}
            {copied ? "Copied" : "Copy SVG"}
          </Button>
        </div>

        {showCode && (
          <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-[11px] leading-5 break-all whitespace-pre-wrap text-muted-foreground">
            {svg}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}

export function BrandAssets() {
  return (
    <div className="not-prose mt-6 grid gap-4 md:grid-cols-2">
      {assets.map((asset) => (
        <AssetCard key={asset.id} asset={asset} />
      ))}
    </div>
  )
}

/* =========================================================
   ANATOMY, CLEAR SPACE, MINIMUM SIZE
========================================================= */

export function LogoAnatomy() {
  return (
    <figure className="not-prose mt-6">
      <Surface className="flex-col gap-6 px-6 py-20">
        <div className="relative w-full max-w-md">
          <Logo className="h-20 size-30 w-full" />
          {/* Mark callout: the mark starts at x 138.4 of 145 */}
          <div className="absolute -top-4 -right-1 flex flex-col items-end text-[11px] text-neutral-500">
            Mark
            <span className="mt-1 h-6 w-px bg-neutral-400" />
          </div>
          {/* Wordmark bracket */}
          <div className="absolute -bottom-9 left-0 w-[96%] text-center text-[11px] text-neutral-500">
            <div className="h-2 border-x border-b border-neutral-400" />
            <span className="mt-1 block">Wordmark</span>
          </div>
        </div>
      </Surface>
    </figure>
  )
}

export function ClearSpace() {
  return (
    <figure className="not-prose mt-6">
      <Surface className="p-8 md:p-20">
        {/* The logo is 48px tall, so x (the height of the P, 17.1 of 23 units) is about 36px. */}
        <div
          className="relative border border-dashed border-[#8504FE]/60 bg-[repeating-linear-gradient(45deg,rgba(133,4,254,0.08)_0_6px,transparent_6px_12px)]"
          style={{ padding: 36 }}
        >
          <div className="bg-white">
            <Logo className="block h-10 size-60" />
          </div>
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <span
              key={side}
              className={cn(
                "absolute font-mono text-[11px] text-[#8504FE]",
                side === "top" && "top-2 left-1/2 -translate-x-1/2",
                side === "bottom" && "bottom-2 left-1/2 -translate-x-1/2",
                side === "left" && "top-1/2 left-3 -translate-y-1/2",
                side === "right" && "top-1/2 right-3 -translate-y-1/2"
              )}
            >
              x
            </span>
          ))}
        </div>
      </Surface>
      <figcaption className="pt-3 text-xs text-muted-foreground">
        x is the height of the P. Keep at least x of empty space on every side.
      </figcaption>
    </figure>
  )
}

export function MinimumSize() {
  return (
    <div className="not-prose mt-6 grid gap-4 sm:grid-cols-2">
      <figure>
        <Surface className="h-40 flex-col gap-4">
          <Logo className="h-auto w-20" />
          <span className="font-mono text-[11px] text-neutral-500">80 px · 20 mm</span>
        </Surface>
        <figcaption className="pt-3 text-xs text-muted-foreground">
          Logo: at least 80 px wide on screen, 20 mm in print.
        </figcaption>
      </figure>
      <figure>
        <Surface className="h-40 flex-col gap-4">
          <LogoIcon className="size-4" />
          <span className="font-mono text-[11px] text-neutral-500">16 px · 5 mm</span>
        </Surface>
        <figcaption className="pt-3 text-xs text-muted-foreground">
          Icon: at least 16 px on screen, 5 mm in print.
        </figcaption>
      </figure>
    </div>
  )
}

/* =========================================================
   COLOUR VERSIONS AND MISUSE
========================================================= */

const versions: { name: string; tone: "light" | "dark" | "brand"; logoClass: string; note: string }[] = [
  { name: "Black", tone: "light", logoClass: "text-black", note: "The default, on white and light photos." },
  { name: "White", tone: "dark", logoClass: "text-white", note: "On black and dark photos." },
  { name: "White on purple", tone: "brand", logoClass: "text-white", note: "On Predict Purple only." },
  { name: "Purple", tone: "light", logoClass: "text-[#8504FE]", note: "On white, for brand moments." },
]

export function LogoColorVersions() {
  return (
    <div className="not-prose mt-6 grid gap-4 sm:grid-cols-2">
      {versions.map((version) => (
        <figure key={version.name}>
          <Surface tone={version.tone} className="h-36">
            <Logo className={cn("h-7 size-30 w-auto", version.logoClass)} />
          </Surface>
          <figcaption className="flex flex-col gap-0.5 pt-3 text-xs">
            <span className="font-medium">{version.name}</span>
            <span className="text-muted-foreground">{version.note}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

const misuse: { rule: string; render: React.ReactNode; tone?: "light" | "muted" }[] = [
  { rule: "Don't stretch or squash it.", render: <Logo className="h-10 size-30 scale-x-150" /> },
  { rule: "Don't rotate it.", render: <Logo className="h-10 size-30 -rotate-12" /> },
  {
    rule: "Don't use colours outside the brand palette.",
    render: <Logo className="h-10 size-30 text-status-severe" />,
  },
  {
    rule: "Don't add shadows, glows, or outlines.",
    render: <Logo className="h-10 size-30 drop-shadow-[0_6px_6px_rgba(133,4,254,0.7)]" />,
  },
  {
    rule: "Don't place it on low-contrast or busy backgrounds.",
    render: (
      <div className="flex size-full items-center justify-center bg-[repeating-linear-gradient(135deg,#C8AAFF_0_14px,#8504FE_14px_28px)]">
        <Logo className="h-10 size-30 text-[#8504FE]" />
      </div>
    ),
  },
  {
    rule: "Don't retype it in another font.",
    render: <span className="font-serif text-3xl tracking-widest">PREDICT</span>,
  },
]

export function LogoMisuse() {
  return (
    <div className="not-prose mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {misuse.map((item) => (
        <figure key={item.rule}>
          <Surface className="h-32">{item.render}</Surface>
          <Verdict ok={false}>{item.rule}</Verdict>
        </figure>
      ))}
    </div>
  )
}

/* =========================================================
   COLOURS
========================================================= */

type Swatch = { name: string; hex: string; token: string; oklch: string; dark?: boolean }

const coreColors: Swatch[] = [
  { name: "Predict Purple", hex: "#8504FE", token: "--primary", oklch: "0.536 0.2917 295.68", dark: true },
  { name: "Black", hex: "#000000", token: "--foreground", oklch: "0 0 0", dark: true },
  { name: "White", hex: "#FFFFFF", token: "--background", oklch: "1 0 0" },
  { name: "Lilac", hex: "#F4EEFF", token: "--secondary", oklch: "0.961 0.0343 295.7" },
]

const purpleScale: Swatch[] = [
  { name: "50", hex: "#FDFCFF", token: "--chart-1", oklch: "0.992 0.0052 295.7" },
  { name: "100", hex: "#F4EEFF", token: "--chart-2", oklch: "0.961 0.0343 295.7" },
  { name: "200", hex: "#E3D3FF", token: "--chart-3", oklch: "0.902 0.0897 295.7" },
  { name: "400", hex: "#C8AAFF", token: "--chart-4", oklch: "0.805 0.1475 295.7" },
  { name: "600", hex: "#8504FE", token: "--chart-5", oklch: "0.536 0.2917 295.7", dark: true },
]

function SwatchCard({ swatch, size = "lg" }: { swatch: Swatch; size?: "lg" | "sm" }) {
  const { copied, copy } = useCopied()

  return (
    <button
      type="button"
      onClick={() => copy(swatch.hex)}
      className="group flex flex-col overflow-hidden rounded-lg border text-left transition hover:border-foreground/30"
      aria-label={`Copy ${swatch.name}, ${swatch.hex}`}
    >
      <span
        className={cn(
          "flex items-end p-3 text-[11px]",
          size === "lg" ? "h-28" : "h-16",
          swatch.dark ? "text-white" : "text-black"
        )}
        style={{ backgroundColor: swatch.hex }}
      >
        <span className="opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {copied ? "Copied" : "Copy hex"}
        </span>
      </span>
      <span className="flex flex-col gap-0.5 p-3 text-xs">
        <span className="font-medium">{swatch.name}</span>
        <span className="font-mono text-muted-foreground">{swatch.hex}</span>
        {size === "lg" && (
          <>
            <span className="font-mono text-muted-foreground">oklch({swatch.oklch})</span>
            <span className="font-mono text-muted-foreground">{swatch.token}</span>
          </>
        )}
      </span>
    </button>
  )
}

export function BrandColors() {
  return (
    <div className="not-prose mt-6 flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {coreColors.map((swatch) => (
          <SwatchCard key={swatch.name} swatch={swatch} />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium">Purple scale</p>
        <div className="grid grid-cols-5 gap-2">
          {purpleScale.map((swatch) => (
            <SwatchCard key={swatch.name} swatch={swatch} size="sm" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** How much of a layout each colour should cover. */
export function ColorProportions() {
  const parts = [
    { name: "White", share: 60, className: "bg-white text-black" },
    { name: "Black", share: 25, className: "bg-black text-white" },
    { name: "Lilac", share: 10, className: "bg-[#F4EEFF] text-black" },
    { name: "Purple", share: 5, className: "bg-[#8504FE] text-white" },
  ]

  return (
    <figure className="not-prose mt-6">
      <div className="flex h-20 overflow-hidden rounded-lg border">
        {parts.map((part) => (
          <div
            key={part.name}
            className={cn("flex items-end p-2 text-[11px]", part.className)}
            style={{ width: `${part.share}%` }}
          >
            {part.share}%
          </div>
        ))}
      </div>
      <figcaption className="pt-3 text-xs text-muted-foreground">
        Mostly white and black, a little lilac, and purple only where it matters.
      </figcaption>
    </figure>
  )
}

/* =========================================================
   TYPOGRAPHY
========================================================= */

const weights = [
  { weight: 300, name: "Light" },
  { weight: 400, name: "Regular" },
  { weight: 500, name: "Medium" },
  { weight: 700, name: "Bold" },
]

export function BrandTypography() {
  return (
    <div className="not-prose mt-6 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Neue Montreal</CardTitle>
          <CardDescription>Headings, body text, and the interface. `font-sans`</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 font-sans">
          <p className="text-7xl font-medium tracking-tight">Aa</p>
          <p className="text-sm break-all text-muted-foreground">
            ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
          </p>
          <ul className="flex flex-col gap-2 border-t pt-4">
            {weights.map(({ weight, name }) => (
              <li key={weight} className="flex items-baseline justify-between gap-4">
                <span className="text-xl tracking-tight" style={{ fontWeight: weight }}>
                  Understand your biology
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {name} {weight}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Geist Mono</CardTitle>
          <CardDescription>Codes, IDs, and numbers that need to line up. `font-mono`</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 font-mono">
          <p className="text-7xl tracking-tight">Aa</p>
          <p className="text-sm break-all text-muted-foreground">0123456789 +−×÷ = % ·</p>
          <dl className="flex flex-col gap-2 border-t pt-4 text-sm">
            {[
              ["LDL-C", "185.5 mg·dL⁻¹"],
              ["hs-CRP", "3.5 mg·L⁻¹"],
              ["Z-score", "+2.71"],
              ["Sample", "PRD-20481"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

/* =========================================================
   MASCOT
========================================================= */

export function MascotShowcase() {
  return (
    <div className="not-prose mt-6 grid gap-4 sm:grid-cols-2">
      <figure>
        <Surface tone="muted" className="h-56">
          <PredictMascot className="size-32" />
        </Surface>
        <figcaption className="pt-3 text-xs text-muted-foreground">
          Animated, for the web. Its eyes follow the cursor.
        </figcaption>
      </figure>
      <figure>
        <Surface tone="muted" className="h-56">
          <PredictMascut className="h-32 w-auto" />
        </Surface>
        <figcaption className="pt-3 text-xs text-muted-foreground">
          Still, for print, email, and social posts.
        </figcaption>
      </figure>
    </div>
  )
}

export function MascotUsage() {
  return (
    <div className="not-prose mt-6 grid gap-4 sm:grid-cols-2">
      <figure>
        <Surface className="h-44 flex-col gap-3 p-6 text-center">
          <PredictMascut className="h-16 w-auto" />
          <p className="text-sm font-medium text-black">No results yet</p>
          <p className="text-xs text-neutral-500">Book your first test to see them here.</p>
        </Surface>
        <Verdict ok>Use it in empty states, onboarding, and celebrations.</Verdict>
      </figure>
      <figure>
        <Surface className="h-44 flex-col gap-3 p-6 text-center">
          <div className="flex items-center gap-3">
            <PredictMascut className="h-14 w-auto" />
            <div className="rounded-md border border-[#FB2C36]/40 bg-[#FB2C36]/10 px-3 py-2 text-left text-xs text-[#B4141C]">
              LDL-C is far above
              <br />
              the healthy range.
            </div>
          </div>
        </Surface>
        <Verdict ok={false}>Don't put it next to out-of-range results or warnings.</Verdict>
      </figure>
    </div>
  )
}
