"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useState } from "react"
import { Pencil, Plus, Trash2, X } from "lucide-react"
import { parseRiskBands, validateRiskBands, type RiskBand } from "@workspace/db/risk-bands"
import { RiskBandsEditor } from "./risk-bands-editor"

export interface EntityField {
  key: string
  label: string
  /**
   * "rupees" is money: typed and shown in rupees, stored and sent in paise.
   * Money is held as an integer everywhere in this product, and asking an
   * admin to enter 45000 for ₹450 is how a price gets set a hundred times
   * wrong.
   */
  type: "text" | "number" | "textarea" | "direction" | "riskBands" | "rupees"
  placeholder?: string
  optional?: boolean
}

export interface EntityItem {
  id: string
  [key: string]: unknown
}

interface EntityManagerProps {
  title: string
  description: string
  backHref: string
  apiPath: string
  listKey: string
  fields: EntityField[]
}

type FormState = Record<string, string | boolean | RiskBand[]>

function emptyForm(fields: EntityField[]): FormState {
  const state: FormState = {}
  for (const field of fields) {
    state[field.key] =
      field.type === "direction" ? true : field.type === "riskBands" ? [] : ""
  }
  return state
}

export function EntityManager({
  title,
  backHref,
  apiPath,
  listKey,
  fields,
}: EntityManagerProps) {
  const [items, setItems] = useState<EntityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm(fields))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(apiPath)
      const data = await res.json()
      setItems(data[listKey] ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [apiPath, listKey])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm(fields))
    setError(null)
    setFormOpen(true)
  }

  const openEdit = (item: EntityItem) => {
    const state: FormState = {}
    for (const field of fields) {
      const value = item[field.key]
      state[field.key] =
      field.type === "direction"
        ? Boolean(value)
        : field.type === "riskBands"
          ? parseRiskBands(value)
          : field.type === "rupees"
            ? value == null || value === 0
              ? ""
              : String(Number(value) / 100)
            : ((value as string) ?? "")
    }
    setEditingId(item.id)
    setForm(state)
    setError(null)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Bands are rejected here as well as on the server: the editor already
    // shows what is wrong with them, and saving anyway would replace that with
    // a less specific message from the API.
    for (const field of fields) {
      if (field.type !== "riskBands") continue
      const problem = validateRiskBands((form[field.key] as RiskBand[]) ?? [])
      if (problem) {
        setError(problem)
        return
      }
    }

    setSaving(true)
    setError(null)

    // Money goes over the wire as paise. Rounded rather than truncated so
    // ₹12.35 does not save as ₹12.34.
    const payload: FormState = { ...form }
    for (const field of fields) {
      if (field.type !== "rupees") continue
      const typed = String(form[field.key] ?? "").trim()
      payload[field.key] = typed === "" ? "0" : String(Math.round(Number(typed) * 100))
    }

    try {
      const res = await fetch(
        editingId ? `${apiPath}/${editingId}` : apiPath,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong")
      }

      closeForm()
      fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item? This cannot be undone.")) return

    await fetch(`${apiPath}/${id}`, { method: "DELETE" })
    fetchItems()
  }

  return (
    <div className="flex flex-col gap-4 p-4 text-black lg:p-6 dark:text-white">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>

        <Button variant="simple" size="lg" className="active:scale-95"
 onClick={openCreate}

 >
          <Plus className="h-4 w-4" />
          Add New
        </Button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              {editingId ? "Edit" : "Create"} {title}
            </p>
            <Button variant="ghost" size="default" className="text-black/65 hover:text-black dark:text-white/40 dark:hover:text-white"
 type="button"
 onClick={closeForm}

 >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div
                key={field.key}
                className={`flex flex-col gap-1.5 ${
                  field.type === "textarea" || field.type === "riskBands" ? "sm:col-span-2" : ""
                }`}
              >
                <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                  {field.label}
                </label>

                {field.type === "riskBands" ? (
                  <RiskBandsEditor
                    value={(form[field.key] as RiskBand[]) ?? []}
                    onChange={(bands) => setForm((f) => ({ ...f, [field.key]: bands }))}
                  />
                ) : field.type === "textarea" ? (
                  <textarea
                    value={(form[field.key] as string) ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    rows={2}
                    className="w-full rounded-md border border-black/22 bg-white px-3 py-2 text-sm outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:focus:border-white/40"
                  />
                ) : field.type === "direction" ? (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="default"
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, [field.key]: true }))}
                      className={`h-auto justify-start whitespace-normal text-left flex-1 border px-3 py-2 text-sm font-medium transition ${
 form[field.key] === true
 ?"border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
 :"border-black/22 text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"
 }`}
                    >
                      Up
                    </Button>
                    <Button variant="ghost" size="default"
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, [field.key]: false }))}
                      className={`h-auto justify-start whitespace-normal text-left flex-1 border px-3 py-2 text-sm font-medium transition ${
 form[field.key] === false
 ?"border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
 :"border-black/22 text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"
 }`}
                    >
                      Down
                    </Button>
                  </div>
                ) : field.type === "rupees" ? (
                  <div className="flex items-center gap-2 rounded-md border border-black/22 bg-white px-3 transition focus-within:border-black/40 dark:border-white/15 dark:bg-black dark:focus-within:border-white/40">
                    <span className="text-sm text-black/50 dark:text-white/35">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required={!field.optional}
                      value={(form[field.key] as string) ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full bg-transparent py-2 text-sm outline-none"
                    />
                  </div>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    step={field.type === "number" ? "any" : undefined}
                    required={!field.optional}
                    value={(form[field.key] as string) ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full rounded-md border border-black/22 bg-white px-3 py-2 text-sm outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:focus:border-white/40"
                  />
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="default" className="hover:bg-black/5 dark:hover:bg-white/5"
 type="button"
 onClick={closeForm}

 >
              Cancel
            </Button>
            <Button variant="simple" size="default"
 type="submit"
 disabled={saving}

 >
              {saving && <PredictSpinner className="size-4" />}
              {editingId ? "Save Changes" : "Create"}
            </Button>
          </div>
        </form>
      )}

      <div className="rounded-md border border-black/18 bg-white dark:border-white/10 dark:bg-black">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-black/65 dark:text-white/40">
            <PredictSpinner />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-black/65 dark:text-white/40">
            Nothing here yet.
          </div>
        ) : (
          <div className="divide-y divide-black/18 dark:divide-white/10">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{String(item.name)}</span>
                    <span className="rounded-full border border-black/22 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black/65 dark:border-white/15 dark:text-white/45">
                      {String(item.shortCode)}
                    </span>
                    {"direction" in item && (
                      <span className="rounded-full border border-black/22 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black/65 dark:border-white/15 dark:text-white/45">
                        {item.direction ? "Up" : "Down"}
                      </span>
                    )}
                  </div>
                  {item.description ? (
                    <span className="mt-0.5 text-xs text-black/60 dark:text-white/40">
                      {String(item.description)}
                    </span>
                  ) : null}
                  {("unit" in item || "rangeMin" in item || "rangeMax" in item) &&
                    (item.unit || item.rangeMin != null || item.rangeMax != null) && (
                      <span className="mt-0.5 text-xs text-black/65 dark:text-white/40">
                        {item.unit ? `Unit: ${item.unit}` : null}
                        {(item.rangeMin != null || item.rangeMax != null) &&
                          `${item.unit ? " · " : ""}Range: ${item.rangeMin ?? "–"} to ${item.rangeMax ?? "–"}`}
                      </span>
                    )}
                  {/* Blank until somebody prices it, rather than "₹0" — what a
                      lab charges is a fact the clinic has, and a zero shown as
                      a price reads as a free test. */}
                  {typeof item.priceInPaise === "number" && item.priceInPaise > 0 && (
                    <span className="mt-0.5 text-xs text-black/65 dark:text-white/40">
                      Test price: ₹{(item.priceInPaise / 100).toLocaleString("en-IN")}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="icon-sm" className="text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
 onClick={() => openEdit(item)}

 title="Edit"
 >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="destructive" size="icon-sm" className="border border-black/18 text-black/60 hover:text-red-500 dark:border-white/10 dark:text-white/60"
 onClick={() => handleDelete(item.id)}

 title="Delete"
 >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
