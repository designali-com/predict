import { EntityManager } from "@/src/components/dashboard/superadmin/entity-manager"

export default function BiomarkersConfigPage() {
  return (
    <EntityManager
      title="Biomarkers"
      description="Individual lab values, e.g. hs-CRP. Direction: Up = higher value ages up, Down = lower value ages up."
      backHref="/biomarkers"
      apiPath="/api/superadmin/biomarker-config/biomarkers"
      listKey="biomarkers"
      fields={[
        { key: "name", label: "Name", type: "text", placeholder: "High-Sensitivity C-Reactive Protein" },
        { key: "shortCode", label: "Short Form", type: "text", placeholder: "hs-CRP" },
        { key: "description", label: "Description", type: "textarea", optional: true },
        { key: "unit", label: "Unit", type: "text", placeholder: "mg.L⁻¹", optional: true },
        { key: "rangeMin", label: "Range Min", type: "number", placeholder: "0", optional: true },
        { key: "rangeMax", label: "Range Max", type: "number", placeholder: "10", optional: true },
        { key: "direction", label: "Direction", type: "direction" },
        // Per marker rather than one blood-test fee: the clinic picks which
        // markers to run, so the price of a panel follows from what is in it.
        { key: "priceInPaise", label: "Test Price", type: "rupees", placeholder: "0", optional: true },
      ]}
    />
  )
}
