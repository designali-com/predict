"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function CardWithAction() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>ApoB</CardTitle>
        <CardDescription>Collected 12 Oct, after a 10 hour fast.</CardDescription>
        <CardAction>
          <Button variant="link" size="sm">
            History
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-medium tabular-nums">
          78 <span className="text-sm text-muted-foreground">mg/dL</span>
        </p>
      </CardContent>
      <CardFooter className="gap-2 border-t">
        <Button size="sm">View report</Button>
        <Button size="sm" variant="outline">
          Share
        </Button>
      </CardFooter>
    </Card>
  )
}
