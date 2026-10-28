"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

export function TabsVertical() {
  return (
    <Tabs orientation="vertical" defaultValue="overview" className="w-full max-w-md">
      <TabsList variant="line">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Latest reading is within range.</TabsContent>
      <TabsContent value="history">Three panels in the last year.</TabsContent>
      <TabsContent value="notes">Collected after a 10 hour fast.</TabsContent>
    </Tabs>
  )
}
