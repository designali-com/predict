"use client"

import { motion } from "framer-motion"
import { Badge } from "@workspace/ui/components/badge" 

// 1. Union type create karein
export type BiomarkerStatus = "High" | "Low" | "Normal" | string

interface BiomarkerCardProps {
  name: string
  fullname: string
  value: string | number
  status?: BiomarkerStatus
  referenceRange: string
}

export function BiomarkerCard({
  name,
  fullname,
  value,
  status = "Normal",
  referenceRange,
}: BiomarkerCardProps) {

  // 2. Fallback check baseline styles ke liye
  const normalizedStatus = (["High", "Low", "Normal"].includes(status) 
    ? status 
    : "Normal") as "High" | "Low" | "Normal"

  const statusStyles = {
    High: "bg-black text-white",
    Low: "bg-background",
    Normal: "bg-background",
  }

  const statusGradients = {
    High: "from-transparent to-red-500",
    Low: "from-background to-red-500",
    Normal: "from-background to-green-500",
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3 rounded-3xl border p-4"
    >
      <div className="flex justify-between">
        <Badge size="sm">
          {name}
        </Badge>

        <span className="text-right text-sm font-medium">
          {fullname}
        </span>
      </div>

      <div>
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          className={`mb-2 relative shadow-[inset_0_6px_6px_rgba(255,255,255,0.4),inset_0_-2px_8px_rgba(255,255,255,0.2)] dark:shadow-[inset_0_6px_6px_rgba(0,0,0,0.4),inset_0_-2px_8px_rgba(0,0,0,0.2)] overflow-hidden flex h-14 items-center justify-between rounded-r-full bg-gradient-to-r ${statusGradients[normalizedStatus]} px-4`}
        >
          <span className="text-xl font-medium">
            {value}
          </span>

          <Badge
            variant="secondary"
            className={statusStyles[normalizedStatus]}
          >
            {status}
          </Badge> 
        </motion.div>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Reference Range</span>
          <span>{referenceRange}</span>
        </div>
      </div>
    </motion.div>
  )
}