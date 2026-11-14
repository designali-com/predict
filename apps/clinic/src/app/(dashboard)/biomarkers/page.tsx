"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity, FlaskConical, Layers, Shuffle } from "lucide-react"

export default function BiomarkerConfigPage() {
  const [counts, setCounts] = useState({ categories: 0, domains: 0, biomarkers: 0 })

  useEffect(() => {
    Promise.all([
      fetch("/api/superadmin/biomarker-config/categories").then((r) => r.json()),
      fetch("/api/superadmin/biomarker-config/domains").then((r) => r.json()),
      fetch("/api/superadmin/biomarker-config/biomarkers").then((r) => r.json()),
    ]).then(([categoriesData, domainsData, biomarkersData]) => {
      setCounts({
        categories: categoriesData.categories?.length ?? 0,
        domains: domainsData.domains?.length ?? 0,
        biomarkers: biomarkersData.biomarkers?.length ?? 0,
      })
    })
  }, [])

  const cards = [
    {
      href: "/biomarkers/categories",
      label: "Main Category",
      description: "Composite biological indices (e.g. CBLAI, CBMI).",
      count: counts.categories,
      icon: Layers,
    },
    {
      href: "/biomarkers/domains",
      label: "Domain",
      description: "Groups of related biomarkers (e.g. Inflammation Risk Factor).",
      count: counts.domains,
      icon: Activity,
    },
    {
      href: "/biomarkers/catalog",
      label: "Biomarker",
      description: "Individual lab values with direction (e.g. hs-CRP).",
      count: counts.biomarkers,
      icon: FlaskConical,
    },
    {
      href: "/biomarkers/mapping",
      label: "Mapping",
      description: "Decide which domain belongs to which category, and which biomarker belongs to which domain.",
      count: null,
      icon: Shuffle,
    },
  ]

  return (
    <div className="flex flex-col gap-4 p-4 text-black lg:p-6 dark:text-white">
      <h1 className="text-xl font-semibold">Biomarker Config</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ href, label, description, count, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-3 rounded-md border border-black/18 bg-white p-5 shadow-sm transition hover:border-black/25 dark:border-white/10 dark:bg-black dark:hover:border-white/25"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-black/18 bg-black/5 dark:border-white/10 dark:bg-white/5">
                <Icon className="h-4 w-4" />
              </div>
              {count !== null && (
                <span className="text-2xl font-semibold tracking-tight">{count}</span>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold">{label}</p>
              <p className="mt-0.5 text-xs text-black/60 dark:text-white/40">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
