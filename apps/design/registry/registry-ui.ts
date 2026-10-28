import type { Registry } from "shadcn/schema"

export const ui: Registry["items"] = [
  {
    name: "bio-clock-demo",
    description: "Basic",
    type: "registry:block",
    files: [
      {
        path: "ui/bio-clock/bio-clock-demo.tsx",
        type: "registry:block",
      },
    ],
  },
  {
    name: "bio-clock-custom",
    description: "Custom values",
    type: "registry:block",
    files: [
      {
        path: "ui/bio-clock/bio-clock-custom.tsx",
        type: "registry:block",
      },
    ],
  },
  {
    name: "bio-clock-domains",
    description: "Custom domains",
    type: "registry:block",
    files: [
      {
        path: "ui/bio-clock/bio-clock-domains.tsx",
        type: "registry:block",
      },
    ],
  },
]
