"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function CardDemo() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>ApoB</CardTitle>
        <CardDescription>Collected 12 Oct, after a 10 hour fast.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-medium tabular-nums">
          78 <span className="text-sm text-muted-foreground">mg/dL</span>
        </p>
        <p className="text-muted-foreground">Optimal range is below 90 mg/dL.</p>
      </CardContent>
    </Card>
  )
}
