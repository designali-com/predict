import { EntityManager } from "@/src/components/dashboard/superadmin/entity-manager"

export default function CategoriesConfigPage() {
  return (
    <EntityManager
      title="Main Categories"
      description="Composite biological indices, e.g. Composite Biological LegAge Index (CBLAI)."
      backHref="/biomarkers"
      apiPath="/api/superadmin/biomarker-config/categories"
      listKey="categories"
      fields={[
        { key: "name", label: "Name", type: "text", placeholder: "Composite Biological LegAge Index" },
        { key: "shortCode", label: "Short Code", type: "text", placeholder: "CBLAI" },
        { key: "description", label: "Description", type: "textarea", optional: true },
        { key: "k", label: "k (ΔAge scaling constant)", type: "number", placeholder: "1", optional: true },
        // Not three fixed thresholds: how many bands an index has, and what
        // they are called, differs per index.
        { key: "riskBands", label: "Risk bands", type: "riskBands", optional: true },
      ]}
    />
  )
}
