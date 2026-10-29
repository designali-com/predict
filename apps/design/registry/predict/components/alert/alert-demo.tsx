"use client"

import { InfoIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"

export function AlertDemo() {
  return (
    <Alert className="max-w-md">
      <InfoIcon />
      <AlertTitle>Fast for 8 hours before your draw</AlertTitle>
      <AlertDescription>
        Water is fine. Glucose and lipid results are only accurate after a fast.
      </AlertDescription>
    </Alert>
  )
}
