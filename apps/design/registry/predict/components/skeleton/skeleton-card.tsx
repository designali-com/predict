"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"

export function SkeletonCard() {
  return (
    <div className="grid w-full max-w-sm gap-3 rounded-lg border p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  )
}
