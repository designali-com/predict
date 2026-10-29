"use client"

import { CircleCheckIcon } from "lucide-react"

import { Alert, AlertTitle } from "@workspace/ui/components/alert"

export function AlertTitleOnly() {
  return (
    <Alert className="max-w-md">
      <CircleCheckIcon className="text-status-normal" />
      <AlertTitle>All 42 biomarkers are back.</AlertTitle>
    </Alert>
  )
}
