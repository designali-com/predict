"use client"

import { CalendarIcon } from "lucide-react"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

export function AlertWithAction() {
  return (
    <Alert className="max-w-md">
      <CalendarIcon />
      <AlertTitle>Retest due</AlertTitle>
      <AlertDescription>Your last panel was 6 months ago.</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline">
          Book
        </Button>
      </AlertAction>
    </Alert>
  )
}
