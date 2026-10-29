import { blocks } from "@/registry/registry-blocks"

export const blockCategoryLabels: Record<string, string> = {
  dashboard: "Dashboard",
  reports: "Reports",
  onboarding: "Onboarding",
  booking: "Booking",
  authentication: "Authentication",
}

export const blockCategories = Object.keys(blockCategoryLabels)

export function getBlocks(category?: string) {
  return blocks.filter((block) => !category || block.categories?.includes(category))
}
