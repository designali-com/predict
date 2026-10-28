"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

export function TabsDisabled() {
  return (
    <Tabs defaultValue="overview" className="w-full max-w-md">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="trends" disabled>
          Trends
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Trends appear after your second panel.</TabsContent>
    </Tabs>
  )
}
