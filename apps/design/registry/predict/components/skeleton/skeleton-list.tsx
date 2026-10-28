"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"

export function SkeletonList() {
  return (
    <div className="grid w-full max-w-sm gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
