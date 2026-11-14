"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"
import { ChevronDown } from "lucide-react"
import { PERIODS, type Period } from "./period"
import { PredictSpinner } from "@/src/components/predict-loader"

/**
 * The window one card is reporting on.
 *
 * Kept in the URL rather than in component state so the card stays a server
 * component — the numbers are a database query, and round-tripping them
 * through the client to change a date range would mean shipping the query
 * there too. It also makes a particular view something you can send someone.
 *
 * Each card carries its own parameter, so changing the appointments window
 * does not silently move the contacts one.
 */
export function PeriodSelect({ param, value }: { param: string; value: Period }) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function change(next: string) {
    const query = new URLSearchParams(params.toString())
    query.set(param, next)
    startTransition(() => {
      router.replace(`?${query.toString()}`, { scroll: false })
    })
  }

  return (
    <div className="relative flex items-center">
      {pending && (
        <PredictSpinner className="size-4" />
      )}
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        aria-label="Period"
        className="appearance-none rounded-md border border-black/18 bg-transparent py-1 pl-2.5 pr-7 text-xs font-medium text-black/70 outline-none transition-colors hover:border-black/30 focus:border-black/40 dark:border-white/10 dark:text-white/70 dark:hover:border-white/30"
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-black/65 dark:text-white/40" />
    </div>
  )
}
