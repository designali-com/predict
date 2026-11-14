"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useMemo, useState } from "react"
import { parseRiskBands, validateRiskBands, type RiskBand } from "@workspace/db/risk-bands"
import { RiskBandsEditor } from "@/src/components/dashboard/superadmin/risk-bands-editor"
import { CheckCircle2, ChevronRight } from "lucide-react"

interface NamedItem {
  id: string
  name: string
  shortCode: string
}

interface CategoryDomainMapping {
  categoryId: string
  domainId: string
  riskBands: unknown
}



interface DomainBiomarkerMapping {
  domainId: string
  biomarkerId: string
}

const CATEGORY_DOMAIN_URL = "/api/superadmin/biomarker-config/mappings/category-domain"
const DOMAIN_BIOMARKER_URL = "/api/superadmin/biomarker-config/mappings/domain-biomarker"

function diffSets(original: Set<string>, current: Set<string>) {
  const toAdd = [...current].filter((id) => !original.has(id))
  const toRemove = [...original].filter((id) => !current.has(id))
  return { toAdd, toRemove }
}

export default function BiomarkerMappingPage() {
  const [categories, setCategories] = useState<NamedItem[]>([])
  const [domains, setDomains] = useState<NamedItem[]>([])
  const [biomarkers, setBiomarkers] = useState<NamedItem[]>([])
  const [categoryDomainMappings, setCategoryDomainMappings] = useState<CategoryDomainMapping[]>([])
  const [domainBiomarkerMappings, setDomainBiomarkerMappings] = useState<DomainBiomarkerMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [selectedCategoryId, setSelectedCategoryId] = useState("")
  const [selectedDomainIds, setSelectedDomainIds] = useState<Set<string>>(new Set())
  const [domainBiomarkerSelections, setDomainBiomarkerSelections] = useState<
    Record<string, Set<string>>
  >({})
  // One band list per domain, keyed by domain id — the thresholds belong to
  // this category's link to that domain, not to the domain itself.
  const [domainRisk, setDomainRisk] = useState<Record<string, RiskBand[]>>({})

  const loadAll = useCallback(async () => {
    const [categoriesRes, domainsRes, biomarkersRes, catDomainRes, domainBioRes] =
      await Promise.all([
        fetch("/api/superadmin/biomarker-config/categories"),
        fetch("/api/superadmin/biomarker-config/domains"),
        fetch("/api/superadmin/biomarker-config/biomarkers"),
        fetch(CATEGORY_DOMAIN_URL),
        fetch(DOMAIN_BIOMARKER_URL),
      ])

    const [categoriesData, domainsData, biomarkersData, catDomainData, domainBioData] =
      await Promise.all([
        categoriesRes.json(),
        domainsRes.json(),
        biomarkersRes.json(),
        catDomainRes.json(),
        domainBioRes.json(),
      ])

    setCategories(categoriesData.categories ?? [])
    setDomains(domainsData.domains ?? [])
    setBiomarkers(biomarkersData.biomarkers ?? [])
    setCategoryDomainMappings(catDomainData.mappings ?? [])

    const domainBioMappings: DomainBiomarkerMapping[] = domainBioData.mappings ?? []
    setDomainBiomarkerMappings(domainBioMappings)

    const nextSelections: Record<string, Set<string>> = {}
    for (const m of domainBioMappings) {
      const set = nextSelections[m.domainId] ?? new Set()
      set.add(m.biomarkerId)
      nextSelections[m.domainId] = set
    }
    setDomainBiomarkerSelections(nextSelections)
  }, [])

  useEffect(() => {
    loadAll().finally(() => setLoading(false))
  }, [loadAll])

  // Re-derive the selected domains (and their weight/alpha inputs) whenever the
  // category (or the underlying mappings, e.g. after a save) changes.
  useEffect(() => {
    if (!selectedCategoryId) {
      setSelectedDomainIds(new Set())
      return
    }
    const mappingsForCategory = categoryDomainMappings.filter(
      (m) => m.categoryId === selectedCategoryId,
    )
    setSelectedDomainIds(new Set(mappingsForCategory.map((m) => m.domainId)))

    const risk: Record<string, RiskBand[]> = {}
    for (const m of mappingsForCategory) {
      risk[m.domainId] = parseRiskBands(m.riskBands)
    }
    setDomainRisk(risk)
  }, [selectedCategoryId, categoryDomainMappings])

  const toggleDomain = (domainId: string, checked: boolean) => {
    setSelectedDomainIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(domainId)
      else next.delete(domainId)
      return next
    })
    if (checked) {
      setDomainRisk((prev) => ({ ...prev, [domainId]: prev[domainId] ?? [] }))
    }
  }

  const setDomainBands = (domainId: string, bands: RiskBand[]) => {
    setDomainRisk((prev) => ({ ...prev, [domainId]: bands }))
  }

  const toggleBiomarker = (domainId: string, biomarkerId: string, checked: boolean) => {
    setDomainBiomarkerSelections((prev) => {
      const domainSet = new Set(prev[domainId] ?? [])
      if (checked) domainSet.add(biomarkerId)
      else domainSet.delete(biomarkerId)
      return { ...prev, [domainId]: domainSet }
    })
  }

  const hasChanges = useMemo(() => {
    if (!selectedCategoryId) return false

    const originalDomains = new Set(
      categoryDomainMappings
        .filter((m) => m.categoryId === selectedCategoryId)
        .map((m) => m.domainId),
    )
    const { toAdd, toRemove } = diffSets(originalDomains, selectedDomainIds)
    if (toAdd.length || toRemove.length) return true

    for (const domainId of selectedDomainIds) {
      const originalMapping = categoryDomainMappings.find(
        (m) => m.categoryId === selectedCategoryId && m.domainId === domainId,
      )
      // Compared as JSON: the bands are a small ordered list, and a
      // field-by-field diff would only re-implement that comparison badly.
      const original = JSON.stringify(parseRiskBands(originalMapping?.riskBands))
      if (JSON.stringify(domainRisk[domainId] ?? []) !== original) return true
    }

    for (const domainId of selectedDomainIds) {
      const original = new Set(
        domainBiomarkerMappings.filter((m) => m.domainId === domainId).map((m) => m.biomarkerId),
      )
      const current = domainBiomarkerSelections[domainId] ?? new Set()
      const diff = diffSets(original, current)
      if (diff.toAdd.length || diff.toRemove.length) return true
    }

    return false
  }, [
    selectedCategoryId,
    selectedDomainIds,
    categoryDomainMappings,
    domainBiomarkerMappings,
    domainBiomarkerSelections,
    domainRisk,
  ])

  const handleSave = async () => {
    if (!selectedCategoryId) return
    setSaving(true)

    try {
      const ops: Promise<unknown>[] = []

      const originalDomains = new Set(
        categoryDomainMappings
          .filter((m) => m.categoryId === selectedCategoryId)
          .map((m) => m.domainId),
      )
      const { toRemove: domainsToRemove } = diffSets(originalDomains, selectedDomainIds)

      // Always (re-)send every currently-checked domain's mapping, including its
      // risk thresholds — this covers both newly-added domains and threshold
      // edits to an already-mapped domain in one pass.
      for (const domainId of selectedDomainIds) {
        const risk = domainRisk[domainId]
        ops.push(
          fetch(CATEGORY_DOMAIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              categoryId: selectedCategoryId,
              domainId,
              riskBands: risk ?? [],
            }),
          }),
        )
      }
      for (const domainId of domainsToRemove) {
        ops.push(
          fetch(
            `${CATEGORY_DOMAIN_URL}?categoryId=${selectedCategoryId}&domainId=${domainId}`,
            { method: "DELETE" },
          ),
        )
      }

      for (const domainId of selectedDomainIds) {
        const original = new Set(
          domainBiomarkerMappings.filter((m) => m.domainId === domainId).map((m) => m.biomarkerId),
        )
        const current = domainBiomarkerSelections[domainId] ?? new Set()
        const { toAdd: biomarkersToAdd, toRemove: biomarkersToRemove } = diffSets(
          original,
          current,
        )

        for (const biomarkerId of biomarkersToAdd) {
          ops.push(
            fetch(DOMAIN_BIOMARKER_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domainId, biomarkerId }),
            }),
          )
        }
        for (const biomarkerId of biomarkersToRemove) {
          ops.push(
            fetch(`${DOMAIN_BIOMARKER_URL}?domainId=${domainId}&biomarkerId=${biomarkerId}`, {
              method: "DELETE",
            }),
          )
        }
      }

      await Promise.all(ops)
      await loadAll()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  // Category -> Domains -> Biomarkers, built purely from saved mappings, for the overview.
  const overview = useMemo(() => {
    return categories.map((category) => {
      const categoryDomains = domains
        .filter((domain) =>
          categoryDomainMappings.some(
            (m) => m.categoryId === category.id && m.domainId === domain.id,
          ),
        )
        .map((domain) => {
          const link = categoryDomainMappings.find(
            (m) => m.categoryId === category.id && m.domainId === domain.id,
          )
          return {
            ...domain,
            riskBands: parseRiskBands(link?.riskBands),
            biomarkers: biomarkers.filter((biomarker) =>
              domainBiomarkerMappings.some(
                (m) => m.domainId === domain.id && m.biomarkerId === biomarker.id,
              ),
            ),
          }
        })

      return { ...category, domains: categoryDomains }
    })
  }, [categories, domains, biomarkers, categoryDomainMappings, domainBiomarkerMappings])

  return (
    <div className="flex flex-col gap-4 p-4 text-black lg:p-6 dark:text-white">

      <div>
        <h1 className="text-xl font-semibold">Mapping</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-black/65 dark:text-white/40">
          <PredictSpinner />
        </div>
      ) : (
        <>
          <div className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
              1. Choose a Category
            </label>

            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="mt-2 w-full rounded-md border border-black/22 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:bg-black dark:focus:border-white/40"
            >
              <option value="">Select a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.shortCode})
                </option>
              ))}
            </select>

            {selectedCategoryId && (
              <>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
                  2. Tick the Domains in this Category
                </p>

                {domains.length === 0 ? (
                  <p className="mt-3 text-sm text-black/65 dark:text-white/40">
                    No domains created yet.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    {domains.map((domain) => {
                      const isChecked = selectedDomainIds.has(domain.id)
                      const domainBiomarkers = domainBiomarkerSelections[domain.id] ?? new Set()

                      return (
                        <div
                          key={domain.id}
                          className={`rounded-md border transition ${
                            isChecked
                              ? "border-black/20 dark:border-white/20"
                              : "border-black/18 dark:border-white/10"
                          }`}
                        >
                          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => toggleDomain(domain.id, e.target.checked)}
                              className="h-4 w-4 accent-black dark:accent-white"
                            />
                            <span className="font-medium">{domain.name}</span>
                            <span className="text-xs text-black/65 dark:text-white/40">
                              {domain.shortCode}
                            </span>
                            {isChecked && domainBiomarkers.size > 0 && (
                              <span className="ml-auto text-xs text-black/65 dark:text-white/40">
                                {domainBiomarkers.size} biomarker
                                {domainBiomarkers.size === 1 ? "" : "s"}
                              </span>
                            )}
                          </label>

                          {isChecked && (
                            <div className="border-t border-black/18 bg-black/[0.02] px-3 py-3 dark:border-white/10 dark:bg-white/[0.02]">
                              {/* The bands for this domain inside this category.
                                  Same editor as the categories screen: how many
                                  bands there are, and which, is the clinic’s call. */}
                              <div>
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
                                  Risk bands
                                </p>
                                <RiskBandsEditor
                                  value={domainRisk[domain.id] ?? []}
                                  onChange={(bands) => setDomainBands(domain.id, bands)}
                                />
                              </div>

                              <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-black/60 dark:text-white/40">
                                <ChevronRight className="h-3 w-3" />
                                Biomarkers in {domain.name}
                              </p>

                              {biomarkers.length === 0 ? (
                                <p className="mt-2 text-sm text-black/65 dark:text-white/40">
                                  No biomarkers created yet.
                                </p>
                              ) : (
                                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                                  {biomarkers.map((biomarker) => (
                                    <label
                                      key={biomarker.id}
                                      className="flex items-center gap-2 text-sm"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={domainBiomarkers.has(biomarker.id)}
                                        onChange={(e) =>
                                          toggleBiomarker(domain.id, biomarker.id, e.target.checked)
                                        }
                                        className="h-3.5 w-3.5 accent-black dark:accent-white"
                                      />
                                      <span>{biomarker.name}</span>
                                      <span className="text-xs text-black/65 dark:text-white/40">
                                        {biomarker.shortCode}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="mt-4 flex items-center gap-3">
                  <Button variant="simple" size="lg"
 onClick={handleSave}
 disabled={!hasChanges || saving}

 >
                    {saving && <PredictSpinner className="size-4" />}
                    Save Mapping
                  </Button>

                  {saved && (
                    <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Saved
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Overview */}
          <div className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
              Current Mapping Overview
            </p>

            {overview.length === 0 ? (
              <p className="mt-3 text-sm text-black/65 dark:text-white/40">
                No categories created yet.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {overview.map((category) => (
                  <div
                    key={category.id}
                    className="rounded-md border border-black/18 p-3 dark:border-white/10"
                  >
                    <p className="text-sm font-semibold">
                      {category.name}{" "}
                      <span className="font-normal text-black/65 dark:text-white/40">
                        ({category.shortCode})
                      </span>
                    </p>

                    {category.domains.length === 0 ? (
                      <p className="mt-1.5 text-sm text-black/65 dark:text-white/40">
                        No domains mapped yet.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {category.domains.map((domain) => (
                          <div key={domain.id} className="flex gap-2 text-sm">
                            <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-black/30 dark:text-white/30" />
                            <div>
                              <span className="font-medium">{domain.name}</span>{" "}
                              <span className="text-xs text-black/65 dark:text-white/40">
                                ({domain.shortCode})
                              </span>
                              {domain.riskBands.length > 0 && (
                                <span className="ml-2 text-xs text-black/65 dark:text-white/40">
                                  {domain.riskBands
                                    .map((b) =>
                                      b.max == null ? `${b.label} ${b.min}+` : `${b.label} <${b.max}`,
                                    )
                                    .join(" · ")}
                                </span>
                              )}
                              {domain.biomarkers.length > 0 ? (
                                <p className="mt-0.5 text-xs text-black/60 dark:text-white/40">
                                  {domain.biomarkers.map((b) => b.shortCode).join(", ")}
                                </p>
                              ) : (
                                <p className="mt-0.5 text-xs text-black/60 dark:text-white/30">
                                  No biomarkers mapped yet.
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
