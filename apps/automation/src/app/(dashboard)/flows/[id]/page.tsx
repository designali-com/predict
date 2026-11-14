"use client"

import { PredictSpinner } from "@/src/components/predict-loader"
import { PageHeader } from "@workspace/ui/components/page-header"

import { use, useEffect, useState } from "react"
import type { Node, Edge } from "@xyflow/react"
import { FlowCanvasBuilder } from "@/src/components/flow-canvas/flow-canvas-builder"

interface RawNode {
  id: string
  type: string
  position?: { x: number; y: number }
  data?: {
    config?: Record<string, unknown>
    nodeKind?: string
    triggerEventType?: string
  }
}
interface RawEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
}

export default function EditAutomationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("")
  const [trigger, setTrigger] = useState("")
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  useEffect(() => {
    fetch(`/api/flows/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setName(data.flow.name)
        setTrigger(data.flow.triggerEventType)

        const rawNodes = (data.version?.nodes ?? []) as RawNode[]
        const rawEdges = (data.version?.edges ?? []) as RawEdge[]

        setNodes(
          rawNodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position ?? { x: 0, y: 0 },
            data: {
              nodeKind: n.data?.nodeKind ?? n.type,
              config: n.data?.config ?? {},
              triggerEventType:
                n.data?.triggerEventType ?? data.flow.triggerEventType,
            },
          }))
        )
        setEdges(
          rawEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? undefined,
          }))
        )
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-[calc(100svh-var(--header-height)-6rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Edit Automation" />
      <FlowCanvasBuilder
        flowId={id}
        initialName={name}
        initialTrigger={trigger}
        initialNodes={nodes}
        initialEdges={edges}
      />
    </div>
  )
}
