import Link from "next/link"

import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { blockCategories, blockCategoryLabels, getBlocks } from "@/src/lib/blocks"

import { BlockDisplay } from "./block-display"

export function BlocksPage({ category }: { category?: string }) {
  const blocks = getBlocks(category)

  return (
    <TooltipProvider>
      <div className="mx-auto w-full max-w-7xl border-x">
        <section className="border-b px-6 py-16 md:px-10 md:py-20">
          <div className="mb-3 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Blocks
          </div>
          <h1 className="max-w-3xl text-4xl font-medium tracking-tight md:text-5xl">
            Building blocks for health apps
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground">
            Whole screens made from PREDICT components: dashboards, reports,
            onboarding, booking, and sign in. Preview them at any width, then
            copy the code or add them with the shadcn CLI.
          </p>
        </section>

        <nav
          aria-label="Block categories"
          className="flex gap-1 overflow-x-auto border-b px-6 py-3 md:px-10"
        >
          {[undefined, ...blockCategories].map((value) => (
            <Link
              key={value ?? "all"}
              href={value ? `/blocks/${value}` : "/blocks"}
              aria-current={value === category ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground",
                value === category && "bg-muted text-foreground"
              )}
            >
              {value ? blockCategoryLabels[value] : "All"}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-16 px-6 py-10 md:px-10">
          {blocks.map((block) => (
            <BlockDisplay key={block.name} name={block.name} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  )
}
