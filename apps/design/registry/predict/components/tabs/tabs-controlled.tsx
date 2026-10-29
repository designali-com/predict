"use client"

import * as React from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

export function TabsControlled() {
  const [tab, setTab] = React.useState("overview")

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Latest reading is within range.</TabsContent>
        <TabsContent value="history">Three panels in the last year.</TabsContent>
        <TabsContent value="notes">Collected after a 10 hour fast.</TabsContent>
      </Tabs>
      <p className="text-muted-foreground text-xs">Active tab: {tab}</p>
    </div>
  )
}
