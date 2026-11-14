
import { TemplateBuilder } from "@/src/components/template-builder"
import { PageHeader } from "@workspace/ui/components/page-header"

export default function NewTemplatePage() {
  return (
    <div className="space-y-4">
      <PageHeader title="New Template" />
      <TemplateBuilder />
    </div>
  )
}
