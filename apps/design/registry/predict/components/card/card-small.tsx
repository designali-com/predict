"use client"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function CardSmall() {
  return (
    <Card size="sm" className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Next draw</CardTitle>
        <CardDescription>Thursday, 8:30 AM at home.</CardDescription>
      </CardHeader>
    </Card>
  )
}
