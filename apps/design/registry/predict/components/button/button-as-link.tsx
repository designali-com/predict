"use client"

import { ArrowUpRightIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

export function ButtonAsLink() {
  return (
    <Button
      nativeButton={false}
      render={<a href="https://predict.fit" target="_blank" rel="noreferrer" />}
    >
      Book a test
      <ArrowUpRightIcon data-icon="inline-end" />
    </Button>
  )
}
