
import { DocsSidebar } from "@/src/components/docs/docs-sidebar"
import { biomarkerSource } from "@/src/lib/source"
import { SidebarProvider } from "@workspace/ui/components/sidebar"

export default function BiomarkersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-7xl border-x flex w-full min-w-0 flex-1 flex-col">
      <SidebarProvider
        style={
          {
            "--sidebar-width": "12rem",
            "--sidebar-width-mobile": "12rem",
          } as React.CSSProperties
        }
        className="flex min-h-0 w-full min-w-0 flex-1"
      >
        <DocsSidebar
          tree={biomarkerSource.pageTree}
          sections={[{ name: "Overview", href: "/biomarkers" }]}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="w-full min-w-0 flex-1">
            {children}
          </div>
        </main>
      </SidebarProvider>
    </div>
  )
}
