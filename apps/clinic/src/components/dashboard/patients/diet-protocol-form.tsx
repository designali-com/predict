"use client"

import { useState } from "react"
import { Plus, Trash2, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PROTOCOL_DAYS, PROTOCOL_DIETS, type DietProtocol, type ProtocolDiet } from "@workspace/db/diet-protocol"

const input =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none"
const cell =
  "w-full min-w-[150px] resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs leading-snug focus:border-ring focus:outline-none"
const label = "mb-1 block text-xs font-medium text-muted-foreground"

/**
 * Every field of a dietary protocol, as boxes — shared by a patient's
 * Nutrition tab and the Care Plan Library, so a protocol is written the same
 * way wherever it is written.
 */
export function DietProtocolForm({
  value: draft,
  onChange,
}: {
  value: DietProtocol
  onChange: (next: DietProtocol) => void
}) {
  const set = <K extends keyof DietProtocol>(key: K, v: DietProtocol[K]) => onChange({ ...draft, [key]: v })

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Diet type</span>
        {PROTOCOL_DIETS.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => set("diet", draft.diet === d.value ? null : (d.value as ProtocolDiet))}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              draft.diet === d.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {d.label}
          </button>
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Protocol title *</label>
          <input className={input} value={draft.title} placeholder="Weight Loss Diet Plan" onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <label className={label}>Badge</label>
          <input className={input} value={draft.badge} placeholder="Clinical Nutrition Protocol for Healthy Weight Loss" onChange={(e) => set("badge", e.target.value)} />
        </div>
        <div>
          <label className={label}>Cooking oils (shown as &quot;Strictly …&quot;)</label>
          <input className={input} value={draft.cookingOils} placeholder="Ghee, Mustard oil, or Olive oil" onChange={(e) => set("cookingOils", e.target.value)} />
        </div>
        <div>
          <label className={label}>Excluded (short line on the summary)</label>
          <input className={input} value={draft.excludedSummary} placeholder="Sugar, milk, potatoes, maida, processed foods, fried items" onChange={(e) => set("excludedSummary", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Note</label>
          <input className={input} value={draft.note} placeholder="7-day meal schedule and portion guide in the printable plan." onChange={(e) => set("note", e.target.value)} />
        </div>
      </section>

      {/* 7-day schedule */}
      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold">7-day meal schedule</p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[1200px] border-collapse text-xs">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="w-44 px-2 py-1.5 font-semibold">Meal (and time)</th>
                {Array.from({ length: PROTOCOL_DAYS }, (_, i) => (
                  <th key={i} className="px-2 py-1.5 font-semibold">
                    Day {i + 1}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {draft.meals.map((meal, r) => (
                <tr key={r} className="border-t border-border align-top">
                  <td className="p-1.5">
                    <textarea
                      rows={2}
                      className={cell}
                      value={meal.label}
                      onChange={(e) => set("meals", draft.meals.map((m, j) => (j === r ? { ...m, label: e.target.value } : m)))}
                    />
                  </td>
                  {meal.days.map((d, i) => (
                    <td key={i} className="p-1.5">
                      <textarea
                        rows={3}
                        className={cell}
                        value={d}
                        onChange={(e) =>
                          set(
                            "meals",
                            draft.meals.map((m, j) =>
                              j === r ? { ...m, days: m.days.map((x, k) => (k === i ? e.target.value : x)) } : m,
                            ),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td className="p-1.5">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remove meal row"
                      onClick={() => set("meals", draft.meals.filter((_, j) => j !== r))}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => set("meals", [...draft.meals, { label: "", days: Array.from({ length: PROTOCOL_DAYS }, () => "") }])}
        >
          <Plus /> Add meal row
        </Button>
        <ListEditor title="Remarks" items={draft.remarks} placeholder="Stay hydrated & stay active" onChange={(v) => set("remarks", v)} />
      </section>

      <ListEditor title="Foods NOT allowed (strict elimination)" items={draft.avoid} placeholder="Add food to avoid" onChange={(v) => set("avoid", v)} />
      <div className="grid gap-4 md:grid-cols-2">
        <ListEditor title="Low GI vegetables" items={draft.vegetables} placeholder="Add vegetable" onChange={(v) => set("vegetables", v)} />
        <ListEditor title="Low GI fruits (portion controlled)" items={draft.fruits} placeholder="Add fruit" onChange={(v) => set("fruits", v)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Portion measurements</p>
          {draft.portions.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input className={input} value={p.measure} placeholder="1 Table Spoon" onChange={(e) => set("portions", draft.portions.map((x, j) => (j === i ? { ...x, measure: e.target.value } : x)))} />
              <input className={`${input} w-32`} value={p.value} placeholder="12 Gms" onChange={(e) => set("portions", draft.portions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => set("portions", draft.portions.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="self-start" onClick={() => set("portions", [...draft.portions, { measure: "", value: "" }])}>
            <Plus /> Add row
          </Button>
        </section>
        <ListEditor title="Grocery list" items={draft.grocery} placeholder="Add grocery item" onChange={(v) => set("grocery", v)} />
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Links of the grocery items</p>
        {draft.links.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_7rem_auto]">
            <input className={input} value={l.name} placeholder="Khapli flour" onChange={(e) => set("links", draft.links.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className={input} value={l.url} placeholder="https://blinkit.com/…" onChange={(e) => set("links", draft.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <input className={input} value={l.store} placeholder="Blinkit" onChange={(e) => set("links", draft.links.map((x, j) => (j === i ? { ...x, store: e.target.value } : x)))} />
            <Button size="icon-sm" variant="ghost" aria-label="Remove link" onClick={() => set("links", draft.links.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="self-start" onClick={() => set("links", [...draft.links, { name: "", url: "", store: "Blinkit" }])}>
          <Plus /> Add link
        </Button>
      </section>

      <section>
        <label className={label}>Physician constraints</label>
        <textarea
          rows={2}
          className={`${input} resize-y`}
          value={draft.physicianConstraints}
          placeholder="No specific restrictions mentioned by doctor."
          onChange={(e) => set("physicianConstraints", e.target.value)}
        />
      </section>
    </div>
  )
}

/** A list of short items with ✕ to remove and a box to add — "+ Add item". */
function ListEditor({
  title,
  items,
  placeholder,
  onChange,
}: {
  title: string
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
}) {
  const [adding, setAdding] = useState("")
  const add = () => {
    const v = adding.trim()
    if (!v) return
    onChange([...items, v])
    setAdding("")
  }
  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{title}</p>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-xs">
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className={input}
          value={adding}
          placeholder={placeholder}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button size="sm" variant="outline" onClick={add} disabled={!adding.trim()}>
          <Plus /> Add
        </Button>
      </div>
    </section>
  )
}

