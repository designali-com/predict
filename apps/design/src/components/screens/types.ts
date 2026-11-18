import type * as React from "react"

/** One phone screen from the Figma "App Design" page, Section 8. */
export interface ScreenEntry {
  /** URL-safe id, unique across all groups. */
  slug: string
  title: string
  /** Source frame in Figma, e.g. "1733:1930". */
  nodeId: string
  /** Renders the 402 × 874 screen contents. */
  component: React.ComponentType
}

export interface ScreenGroup {
  slug: string
  title: string
  screens: ScreenEntry[]
}

export const FIGMA_FILE_URL = "https://www.figma.com/design/gAnjUgpK63tTzC9AgOyGma/Predict"

export function figmaNodeUrl(nodeId: string) {
  return `${FIGMA_FILE_URL}?node-id=${nodeId.replace(":", "-")}`
}

interface ScreenModule {
  title: string
  default: React.ComponentType
}

/** Builds a registry entry from a screen module (`export const title` + default component). */
export function screen(slug: string, nodeId: string, mod: ScreenModule): ScreenEntry {
  return { slug, nodeId, title: mod.title, component: mod.default }
}
