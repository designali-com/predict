"use client"

import * as React from "react"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination"

const totalPages = 5

export function PaginationControlled() {
  const [page, setPage] = React.useState(1)

  const goTo = (next: number) => (event: React.MouseEvent) => {
    event.preventDefault()
    setPage(Math.min(Math.max(next, 1), totalPages))
  }

  return (
    <div className="grid w-full gap-3">
      <p className="text-center text-xs text-muted-foreground">
        Reports {page * 10 - 9}–{page * 10} of {totalPages * 10}
      </p>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={goTo(page - 1)}
              aria-disabled={page === 1}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            />
          </PaginationItem>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <PaginationItem key={n}>
              <PaginationLink href="#" isActive={n === page} onClick={goTo(n)}>
                {n}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={goTo(page + 1)}
              aria-disabled={page === totalPages}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
