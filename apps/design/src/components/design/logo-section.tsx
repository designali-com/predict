"use client"

import * as React from "react"
import {
  Check,
  Clipboard,
  Code2,
  Download,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import {
  LogoIcon,
  PredictLogo,
  PredictMascut,
} from "@workspace/ui/predict/logo"
 

type LogoItem = {
  id: string
  name: string
  description: string
  component: React.ReactNode
}

const logoItems: LogoItem[] = [
  {
    id: "logo-icon",
    name: "Logo Icon",
    description: "Standalone Predict mark",
    component: <LogoIcon className="size-24" />,
  },
  {
    id: "predict-logo",
    name: "Predict Logo",
    description: "Primary Predict wordmark",
    component: (
      <PredictLogo className="h-auto w-full max-w-[520px]" />
    ),
  },
  {
    id: "predict-mascot",
    name: "Predict Mascot",
    description: "Predict mascot / brand character",
    component: (
      <PredictMascut className="h-auto w-30" />
    ),
  },
]

/**
 * Convert the rendered SVG element into
 * a standalone downloadable SVG string.
 */
function serializeSvg(element: SVGSVGElement) {
  const clone = element.cloneNode(true) as SVGSVGElement

  // Remove React/Tailwind classes from the root.
  clone.removeAttribute("class")

  // Add standard SVG namespaces.
  clone.setAttribute(
    "xmlns",
    "http://www.w3.org/2000/svg"
  )

  clone.setAttribute(
    "xmlns:xlink",
    "http://www.w3.org/1999/xlink"
  )

  // Remove attributes that are only useful for the preview.
  clone.removeAttribute("style")

  // Make currentColor work when the SVG
  // is opened outside the application.
  const elements = [
    clone,
    ...Array.from(clone.querySelectorAll("*")),
  ]

  elements.forEach((node) => {
    const el = node as SVGElement

    const fill = el.getAttribute("fill")

    if (fill === "currentColor") {
      el.setAttribute("fill", "#050505")
    }

    const stroke = el.getAttribute("stroke")

    if (stroke === "currentColor") {
      el.setAttribute("stroke", "#050505")
    }

    const className = el.getAttribute("class") || ""

    // Convert common Tailwind background
    // classes to a real SVG fill.
    if (className.includes("fill-background")) {
      el.removeAttribute("class")
      el.setAttribute("fill", "#ffffff")
    }

    // Convert text/background color classes
    // if they exist inside the SVG.
    if (className.includes("text-background")) {
      el.removeAttribute("class")
      el.setAttribute("fill", "#ffffff")
    }

    if (className.includes("fill-foreground")) {
      el.removeAttribute("class")
      el.setAttribute("fill", "#050505")
    }

    if (className.includes("text-foreground")) {
      el.removeAttribute("class")
      el.setAttribute("fill", "#050505")
    }

    // Remove empty class attributes.
    if (el.getAttribute("class") === "") {
      el.removeAttribute("class")
    }
  })

  // Remove preview-only background attributes.
  clone.removeAttribute("background")

  const serializer = new XMLSerializer()

  return serializer
    .serializeToString(clone)
    .replace(/>\s+</g, "><")
}

/**
 * Download an SVG as a file.
 */
function downloadSvg(
  svg: string,
  filename: string
) {
  if (!svg) return

  const blob = new Blob(
    [svg],
    {
      type: "image/svg+xml;charset=utf-8",
    }
  )

  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.style.display = "none"

  document.body.appendChild(link)

  link.click()

  document.body.removeChild(link)

  // Give the browser a moment before
  // releasing the object URL.
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 100)
}

function LogoActions({
  svg,
  filename,
}: {
  svg: string
  filename: string
}) {
  const [copied, setCopied] =
    React.useState(false)

  async function copySvg() {
    if (!svg) return

    try {
      await navigator.clipboard.writeText(svg)

      setCopied(true)

      window.setTimeout(() => {
        setCopied(false)
      }, 1500)
    } catch (error) {
      console.error(
        "Unable to copy SVG",
        error
      )
    }
  }

  function handleDownload() {
    if (!svg) return

    downloadSvg(svg, filename)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={copySvg}
        disabled={!svg}
        className="
          inline-flex h-9
          items-center gap-2
          rounded-lg
          border border-border
          bg-background
          px-3
          text-sm font-medium
          transition-colors
          hover:bg-muted
          disabled:pointer-events-none
          disabled:opacity-50
        "
      >
        {copied ? (
          <>
            <Check className="size-4" />
            Copied
          </>
        ) : (
          <>
            <Clipboard className="size-4" />
            Copy SVG
          </>
        )}
      </button>

      <button
        type="button"
        onClick={handleDownload}
        disabled={!svg}
        className="
          inline-flex h-9
          items-center gap-2
          rounded-lg
          border border-border
          bg-background
          px-3
          text-sm font-medium
          transition-colors
          hover:bg-muted
          disabled:pointer-events-none
          disabled:opacity-50
        "
      >
        <Download className="size-4" />
        Download SVG
      </button>
    </div>
  )
}

function LogoCard({
  item,
}: {
  item: LogoItem
}) {
  const previewRef =
    React.useRef<HTMLDivElement>(null)

  const [svg, setSvg] =
    React.useState("")

  const [showCode, setShowCode] =
    React.useState(false)

  const getSvg = React.useCallback(() => {
    if (!previewRef.current) {
      return ""
    }

    const element =
      previewRef.current.querySelector("svg")

    if (!element) {
      return ""
    }

    const serialized =
      serializeSvg(element)

    setSvg(serialized)

    return serialized
  }, [])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      getSvg()
    }, 50)

    return () => {
      window.clearTimeout(timer)
    }
  }, [getSvg])

  function handleToggleCode() {
    if (!svg) {
      getSvg()
    }

    setShowCode((value) => !value)
  }

  return (
    <Card className="overflow-hidden pt-0">
      {/* Logo Preview */}
      <div
        ref={previewRef}
        className="
          relative
          flex
          h-80
          w-full
          items-center
          justify-center
          overflow-hidden
          p-10
        "
      >
        <div className="flex w-full items-center justify-center">
          {item.component}
        </div>
      </div>

      {/* Card Header */}
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          {item.name}
        </CardTitle>

        <CardDescription>
          {item.description}
        </CardDescription>
      </CardHeader>

      {/* Card Content */}
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <LogoActions
            svg={svg}
            filename={`${item.id}.svg`}
          />

          <button
            type="button"
            onClick={handleToggleCode}
            className="
              inline-flex h-9
              items-center gap-2
              rounded-lg
              border border-border
              bg-background
              px-3
              text-sm font-medium
              transition-colors
              hover:bg-muted
            "
          >
            <Code2 className="size-4" />

            {showCode
              ? "Hide SVG"
              : "View SVG"}
          </button>
        </div>

        {/* SVG Source */}
        {showCode && (
          <div className="mt-4">
            <div
              className="
                overflow-hidden
                rounded-xl
                border border-border
              "
            >
              <div
                className="
                  flex h-9
                  items-center
                  border-b border-border
                  bg-muted/40
                  px-3
                "
              >
                <span
                  className="
                    text-[10px]
                    font-medium
                    uppercase
                    tracking-wider
                    text-muted-foreground
                  "
                >
                  SVG Source
                </span>
              </div>

              <pre
                className="
                  max-h-[320px]
                  overflow-auto
                  bg-muted/20
                  p-4
                  text-[11px]
                  leading-5
                  text-muted-foreground
                "
              >
                <code>
                  {svg || "Generating SVG..."}
                </code>
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function PredictLogos() {
  return (
    <main
      className=" 
        space-y-4  
      "
    > 
    
      <header className="mb-10">
        <div
          className="
            mb-3
            text-xs
            font-medium
            uppercase
            tracking-[0.18em]
            text-muted-foreground
          "
        >
          Brand
        </div>

        <div
          className="
            flex flex-col
            gap-6
            md:flex-row
            md:items-end
            md:justify-between
          "
        >
          <div>
            <h1
              className="
                text-4xl
                font-medium
                tracking-tight
                md:text-5xl
              "
            >
              Predict Logo
            </h1>

            <p
              className="
                mt-4
                max-w-2xl
                text-base
                leading-7
                text-muted-foreground
              "
            >
              Official Predict logo assets.
              Copy the SVG source or download
              the original artwork for your
              projects.
            </p>
          </div>

           
        </div>
      </header>

      {/* Logo Grid */}
      <div
        className="
          grid
          gap-4
          md:grid-cols-3
        "
      >
        {logoItems.map((item) => (
          <LogoCard
            key={item.id}
            item={item}
          />
        ))}
      </div>

      {/* Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Logo usage
          </CardTitle>

          <CardDescription>
            Keep the Predict identity
            consistent across every
            application.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div
            className="
              grid gap-4
              md:grid-cols-3
            "
          >
            <div
              className="
                rounded-xl
                border
                border-border
                p-4
              "
            >
              <h3
                className="
                  text-sm
                  font-medium
                "
              >
                Use SVG
              </h3>

              <p
                className="
                  mt-2
                  text-sm
                  leading-6
                  text-muted-foreground
                "
              >
                SVG is the preferred
                format for websites,
                applications, and
                digital products.
              </p>
            </div>

            <div
              className="
                rounded-xl
                border
                border-border
                p-4
              "
            >
              <h3
                className="
                  text-sm
                  font-medium
                "
              >
                Don't distort
              </h3>

              <p
                className="
                  mt-2
                  text-sm
                  leading-6
                  text-muted-foreground
                "
              >
                Never stretch, squash,
                rotate, or distort the
                Predict logo.
              </p>
            </div>

            <div
              className="
                rounded-xl
                border
                border-border
                p-4
              "
            >
              <h3
                className="
                  text-sm
                  font-medium
                "
              >
                Preserve clear space
              </h3>

              <p
                className="
                  mt-2
                  text-sm
                  leading-6
                  text-muted-foreground
                "
              >
                Leave enough space around
                the logo so it remains
                clear and recognizable.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}