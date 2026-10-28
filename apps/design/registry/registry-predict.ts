 
import type { Registry } from "shadcn/schema"

function block(name: string, description: string, file: string): Registry["items"][number] {
  return {
    name,
    description,
    type: "registry:block",
    files: [
      {
        path: file,
        type: "registry:block",
      },
    ],
  }
}

export const predict: Registry["items"] = [
  block("age-calculator-demo", "Basic", "tools/age-calculator/age-calculator-demo.tsx"),
  block("age-calculator-default", "Born early", "tools/age-calculator/age-calculator-default.tsx"),
  block("age-calculator-on-change", "Listen for changes", "tools/age-calculator/age-calculator-on-change.tsx"),
  block("body-measurements-demo", "Basic", "tools/body-measurements/body-measurements-demo.tsx"),
  block("body-measurements-default", "Custom values", "tools/body-measurements/body-measurements-default.tsx"),
  block("body-measurements-child", "Child", "tools/body-measurements/body-measurements-child.tsx"),
  block("reference-range-demo", "Basic", "tools/reference-range/reference-range-demo.tsx"),
  block("reference-range-flags", "Flags", "tools/reference-range/reference-range-flags.tsx"),
  block("reference-range-interactive", "Interactive", "tools/reference-range/reference-range-interactive.tsx"),
  block("reference-range-panel", "Biomarker panel", "tools/reference-range/reference-range-panel.tsx"),
]
