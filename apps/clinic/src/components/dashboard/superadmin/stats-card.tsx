import { ReactNode } from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface StatsCardProps {
  label: string
  value: string | number
  icon: ReactNode
  trend?: "up" | "down" | "neutral"
  trendLabel?: string
  accentColor?: string
}

export function StatsCard({
  label,
  value,
  icon,
  trend,
  trendLabel,
  accentColor = "purple",
}: StatsCardProps) {
  const trendIcon =
    trend === "up" ? (
      <TrendingUp className="h-3 w-3 text-black dark:text-white" />
    ) : trend === "down" ? (
      <TrendingDown className="h-3 w-3 text-black dark:text-white" />
    ) : (
      <Minus className="h-3 w-3 text-black/65 dark:text-white/40" />
    )

  const trendColor =
    trend === "up"
      ? "text-black dark:text-white"
      : trend === "down"
        ? "text-black dark:text-white"
        : "text-black/65 dark:text-white/40"

  return (
    <div className="relative overflow-hidden rounded-md border border-black/20 bg-white p-4 text-black dark:border-white/20 dark:bg-black dark:text-white">
      <div
        className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-black/5 blur-2xl dark:bg-white/5"
      />

      <div className="relative flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-black/60 dark:text-white/50">
            {label}
          </span>
          <span className="text-3xl font-semibold tracking-tight text-black dark:text-white">
            {value}
          </span>
          {trendLabel && (
            <div className={`flex items-center gap-1 text-[11px] ${trendColor}`}>
              {trendIcon}
              <span>{trendLabel}</span>
            </div>
          )}
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-black/18 bg-black/5 text-black dark:border-white/10 dark:bg-white/5 dark:text-white">
          {icon}
        </div>
      </div>
    </div>
  )
}
