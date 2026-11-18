import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The top of a page: its title, an optional line saying what the page is for,
 * and the page's main actions on the right. One component so every screen's
 * heading has the same size, weight and spacing — a page should not pick its
 * own. Actions sit to the right, and wrap under the title when there is no room.
 */
function PageHeader({
  title,
  description,
  actions,
  icon,
  className,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  icon?: React.ReactNode
  className?: string
  /** Anything else under the title — badges, a status line. */
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="page-header"
      className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}
    >
      <div className="min-w-0 flex-1">
        <h1 className="page-title flex items-center gap-2">
          {icon}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {description && <p className="page-description">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export { PageHeader }
