"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@workspace/ui/components/button"

export const PAGE_SIZES = [50, 100, 200] as const
export type PageSize = (typeof PAGE_SIZES)[number]

/**
 * The foot of a long list: how much is showing, how many per page, and the
 * way to the next page. The same control as the clinic app's appointments and
 * patients lists, so every long list pages the same way.
 */
export function ListPagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  /** 1-based. */
  page: number
  pageSize: PageSize
  total: number
  onPage: (page: number) => void
  onPageSize: (size: PageSize) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  // A few page numbers around the current one, with the ends always reachable.
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
      <span className="text-xs text-muted-foreground">
        {total === 0 ? "Nothing to show" : `Showing ${from}–${to} of ${total}`}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Per page
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value) as PageSize)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-9 w-9 p-0" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {nums.map((n, i) => (
              <span key={n} className="flex items-center gap-1">
                {i > 0 && n - nums[i - 1]! > 1 && <span className="px-0.5 text-muted-foreground">…</span>}
                <Button variant={n === page ? "default" : "outline"} size="sm" className="h-9 min-w-9 px-2.5" onClick={() => onPage(n)}>
                  {n}
                </Button>
              </span>
            ))}
            <Button variant="outline" size="sm" className="h-9 w-9 p-0" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
