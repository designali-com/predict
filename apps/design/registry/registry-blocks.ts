import type { Registry } from "shadcn/schema"

type BlockFile = { path: string; target: string }

function block({
  name,
  description,
  category,
  route,
  iframeHeight,
  components = [],
}: {
  name: string
  description: string
  category: string
  /** Route the page installs to, such as "dashboard". */
  route: string
  iframeHeight: number
  /** Files next to the page, relative to the block folder. */
  components?: string[]
}): Registry["items"][number] {
  const files: BlockFile[] = [
    { path: `blocks/${name}/page.tsx`, target: `app/${route}/page.tsx` },
    ...components.map((file) => ({
      path: `blocks/${name}/${file}`,
      target: `app/${route}/${file}`,
    })),
  ]

  return {
    name,
    description,
    type: "registry:block",
    categories: [category],
    meta: { iframeHeight: `${iframeHeight}px` },
    files: files.map((file, index) => ({
      ...file,
      type: index === 0 ? "registry:page" : "registry:component",
    })),
  }
}

export const blocks: Registry["items"] = [
  block({
    name: "dashboard-01",
    description: "A health dashboard with a sidebar, bio clock, pace of ageing, and flagged biomarkers.",
    category: "dashboard",
    route: "dashboard",
    iframeHeight: 1000,
    components: ["components/app-sidebar.tsx", "components/biomarker-grid.tsx"],
  }),
  block({
    name: "report-01",
    description: "A biomarker report with a summary and results grouped by body system.",
    category: "reports",
    route: "report",
    iframeHeight: 900,
  }),
  block({
    name: "index-01",
    description: "A composite index score with each domain's share and its biomarker Z-scores.",
    category: "reports",
    route: "index",
    iframeHeight: 960,
  }),
  block({
    name: "onboarding-01",
    description: "A three-step health profile with body measurements, activity, and sharing settings.",
    category: "onboarding",
    route: "onboarding",
    iframeHeight: 720,
  }),
  block({
    name: "booking-01",
    description: "Book a blood test: pick a date, a morning slot, and a clinic, then confirm.",
    category: "booking",
    route: "book",
    iframeHeight: 820,
  }),
  block({
    name: "login-01",
    description: "A sign-in page with the logo and a mascot panel.",
    category: "authentication",
    route: "login",
    iframeHeight: 760,
  }),
]
