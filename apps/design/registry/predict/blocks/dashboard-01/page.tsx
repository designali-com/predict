"use client"

import { CalendarIcon, DownloadIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"
import { AgeBar } from "@workspace/ui/predict/age-bar"
import { BioClock } from "@workspace/ui/predict/bio-clock"

import { AppSidebar } from "./components/app-sidebar"
import { BiomarkerGrid } from "./components/biomarker-grid"

export default function Page() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger /> 
          <h1 className="text-sm font-medium">Overview</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden sm:inline-flex">
              <CalendarIcon data-icon="inline-start" />
              12 Oct 2026
            </Button>
            <Button size="sm">
              <DownloadIcon data-icon="inline-start" />
              Report
            </Button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-sm">Bio clock</CardTitle>
                <CardDescription>
                  Biological age, severity, and the domain that stands out.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BioClock
                  bioAge={45}
                  yearsValue="+7 Years"
                  currentValue={2.6}
                  className="mx-auto max-w-md"
                />
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Pace of ageing</CardTitle>
                  <CardDescription>Biological against chronological age.</CardDescription>
                </CardHeader>
                <CardContent>
                  <AgeBar biologicalAge={45} chronologicalAge={38} />
                </CardContent>
              </Card>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Tested", value: "40" },
                  { label: "Out of range", value: "9" },
                  { label: "Critical", value: "1" },
                ].map((stat) => (
                  <Card key={stat.label} size="sm">
                    <CardContent className="flex flex-col gap-1">
                      <span className="text-muted-foreground">{stat.label}</span>
                      <span className="text-2xl font-medium tabular-nums">{stat.value}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          <BiomarkerGrid />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
