import type { Registry } from "shadcn/schema"; 
import { ui } from "@/registry/registry-ui";
import { components } from "./registry-components";
import { predict } from "./registry-predict";
import { blocks } from "./registry-blocks";

export const registry = {
  homepage: "https://predict.fit",
  items: [
    ...ui, 
    ...(components as Registry["items"]),
    ...predict,
    ...blocks,
  ],
  name: "predict design",
} satisfies Registry;