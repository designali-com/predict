"use client"
import { Button } from "@workspace/ui/components/button"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Save, FlaskConical } from "lucide-react"
import { DomainEventType } from "@workspace/db/domain-events"
import { toast } from "@workspace/ui/components/sonner"
import { AutomationNode, type CanvasNodeData } from "./automation-node"
import { NodePalette } from "./node-palette"
import { NodeConfigPanel } from "./node-config-panel"
import { type NodeKind } from "./node-meta"
import { PredictSpinner } from "@/src/components/predict-loader"

const nodeTypes: NodeTypes = new Proxy(
  {},
  { get: () => AutomationNode }
) as NodeTypes

const TRIGGER_NODE_ID = "trigger-1"

function defaultTriggerNode(triggerEventType: string): Node {
  return {
    id: TRIGGER_NODE_ID,
    type: "trigger",
    position: { x: 40, y: 160 },
    data: {
      nodeKind: "trigger",
      config: {},
      triggerEventType,
    } satisfies CanvasNodeData,
  }
}

export interface FlowCanvasBuilderProps {
  flowId?: string
  initialName?: string
  initialTrigger?: string
  initialNodes?: Node[]
  initialEdges?: Edge[]
}

function BuilderInner({
  flowId,
  initialName = "",
  initialTrigger,
  initialNodes,
  initialEdges,
}: FlowCanvasBuilderProps) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [trigger, setTrigger] = useState(
    initialTrigger ?? Object.values(DomainEventType)[0]!
  )
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    initialNodes && initialNodes.length > 0
      ? initialNodes
      : [defaultTriggerNode(trigger)]
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialEdges ?? []
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTriggerChange = (value: string) => {
    setTrigger(value)
    setNodes((nds) =>
      nds.map((n) =>
        n.id === TRIGGER_NODE_ID
          ? { ...n, data: { ...n.data, triggerEventType: value } }
          : n
      )
    )
  }

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  )

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id))
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
      setSelectedId((sel) => (sel === id ? null : sel))
    },
    [setNodes, setEdges]
  )

  const addNode = (kind: NodeKind) => {
    const id = `${kind}-${Date.now().toString(36)}`
    const offset = nodes.length * 40
    const newNode: Node = {
      id,
      type: kind,
      position: { x: 340 + (offset % 300), y: 120 + offset },
      data: { nodeKind: kind, config: {} } satisfies CanvasNodeData,
    }
    setNodes((nds) => [...nds, newNode])
    setSelectedId(id)
  }

  const updateSelectedConfig = (config: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedId ? { ...n, data: { ...n.data, config } } : n
      )
    )
  }

  // Inject the delete callback at render time so it never ends up in
  // persisted node state (functions aren't JSON-serializable).
  const renderNodes = useMemo(
    () =>
      nodes.map((n) => ({ ...n, data: { ...n.data, onDelete: deleteNode } })),
    [nodes, deleteNode]
  )

  const selectedNode = nodes.find((n) => n.id === selectedId)

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    // Strip non-serializable callbacks before persisting.
    const cleanNodes = nodes.map((n) => {
      const { onDelete: _onDelete, ...rest } = n.data as CanvasNodeData
      return { ...n, data: rest }
    })

    try {
      const res = await fetch(flowId ? `/api/flows/${flowId}` : "/api/flows", {
        method: flowId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          triggerEventType: trigger,
          nodes: cleanNodes,
          edges,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to save")
      toast.success("Automation saved")
      // Saved — back to the list, where the new or updated flow shows.
      router.push("/flows")
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save"
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
        <input
          placeholder="Automation name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none"
        />
        <select
          value={trigger}
          onChange={(e) => handleTriggerChange(e.target.value)}
          className="rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none"
        >
          {Object.values(DomainEventType).map((t) => (
            <option key={t} value={t}>
              WHEN {t}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button
            onClick={handleSave}
            disabled={saving || !name}>
            {saving ? (
              <PredictSpinner className="size-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Automation
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden rounded-md border border-border">
        <NodePalette onAdd={addNode} />

        <div className="relative flex-1">
          <ReactFlow
            nodes={renderNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap pannable zoomable className="!bg-card" />
          </ReactFlow>

          {!selectedId && (
            <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-1.5 rounded-md bg-muted/80 px-3 py-1.5 text-xs text-primary-foreground">
              <FlaskConical className="h-3.5 w-3.5" />
              Click a step in the palette to add it, drag from the dot on a node
              to connect it to the next step.
            </div>
          )}
        </div>

        {selectedNode && (
          <NodeConfigPanel
            nodeId={selectedNode.id}
            data={selectedNode.data as CanvasNodeData}
            onChange={updateSelectedConfig}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}

export function FlowCanvasBuilder(props: FlowCanvasBuilderProps) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  )
}
