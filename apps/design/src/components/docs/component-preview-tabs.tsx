"use client"

import * as React from "react"

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { cn } from "@workspace/ui/lib/utils"

export function ComponentPreviewTabs({
  className,
  align = "center",
  hideCode = false,
  component,
  source,
  ...props
}: React.ComponentProps<"div"> & {
  align?: "center" | "start" | "end"
  hideCode?: boolean
  component: React.ReactNode
  source: React.ReactNode
}) {
  const [tab, setTab] = React.useState("preview")

  return (
    <div
      className={cn(
        "group relative mt-4 mb-12 flex flex-col gap-2",
        className
      )}
      {...props}
    >
      <Tabs
        onValueChange={setTab}
        value={tab}
      >
        <div className="flex items-center justify-between">
          {!hideCode && (
            <TabsList>
              <TabsTrigger value="preview">
                Preview
              </TabsTrigger>

              <TabsTrigger value="code">
                Code
              </TabsTrigger>
            </TabsList>
          )}
        </div>
      </Tabs>

      <div
        className="relative w-full rounded-xl border"
        data-tab={tab}
      >
        {/* Preview */}
        <div
          className="invisible data-[active=true]:visible"
          data-active={tab === "preview"}
        >
          <div
            className={cn(
              "flex min-h-[450px] w-full overflow-y-auto p-10",
              "max-sm:px-6",

              align === "center" && "items-center justify-center",
              align === "start" && "items-start justify-start",
              align === "end" && "items-end justify-end",
            )}
          >
            <div
              data-slot="preview"
              className={cn(
                "min-w-0 w-full",
                align === "center" && "flex justify-center",
                align === "start" && "flex justify-start",
                align === "end" && "flex justify-end"
              )}
            >
              {component}
            </div>
          </div>
        </div>

        {/* Code */}
        <div
          className={cn(
            "absolute inset-0 hidden overflow-hidden data-[active=true]:block",
            "**:[figure]:m-0!",
            "**:[pre]:h-[450px]"
          )}
          data-active={tab === "code"}
          data-slot="code"
        >
          {source}
        </div>
      </div>
    </div>
  )
}