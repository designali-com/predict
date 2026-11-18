import { EntityManager } from "@/src/components/dashboard/superadmin/entity-manager"

export default function DomainsConfigPage() {
  return (
    <EntityManager
      title="Domains"
      description="Groups of related biomarkers, e.g. Inflammation Risk Factor (IFR)."
      backHref="/biomarkers"
      apiPath="/api/superadmin/biomarker-config/domains"
      listKey="domains"
      fields={[
        { key: "name", label: "Name", type: "text", placeholder: "Inflammation Risk Factor" },
        { key: "shortCode", label: "Short Code", type: "text", placeholder: "IFR" },
        { key: "description", label: "Description", type: "textarea" },
      ]}
    />
  )
}
