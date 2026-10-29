"use client"

import { TriangleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"

export function AlertDestructive() {
  return (
    <Alert variant="destructive" className="max-w-md">
      <TriangleAlertIcon />
      <AlertTitle>Sample could not be processed</AlertTitle>
      <AlertDescription>
        The lab received a haemolysed sample. Book a new draw to get your results.
      </AlertDescription>
    </Alert>
  )
}
