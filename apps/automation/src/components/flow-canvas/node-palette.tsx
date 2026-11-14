"use client"
import { Button } from "@workspace/ui/components/button"

import { ADDABLE_NODE_KINDS, NODE_META, type NodeKind } from "./node-meta"

interface NodePaletteProps {
  onAdd: (kind: NodeKind) => void
}

export function NodePalette({ onAdd }: NodePaletteProps) {
  return (
    <div className="flex h-full w-56 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add a step</p>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {ADDABLE_NODE_KINDS.map((kind) => {
          const meta = NODE_META[kind]
          const Icon = meta.icon
          return (
            <Button
              key={kind}
              onClick={() => onAdd(kind)} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-primary-foreground"
                style={{ backgroundColor: meta.color }}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{meta.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{meta.description}</span>
              </span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
