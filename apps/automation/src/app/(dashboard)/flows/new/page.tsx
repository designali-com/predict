import { FlowCanvasBuilder } from "@/src/components/flow-canvas/flow-canvas-builder"
import { PageHeader } from "@workspace/ui/components/page-header"

export default function NewAutomationPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="New Automation" />
      <FlowCanvasBuilder />
    </div>
  )
}
