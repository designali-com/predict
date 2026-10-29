import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BlocksPage } from "@/src/components/blocks/blocks-page"
import { blockCategories, blockCategoryLabels } from "@/src/lib/blocks"

export const dynamicParams = false

export function generateStaticParams() {
  return blockCategories.map((category) => ({ category }))
}

interface CategoryPageProps {
  params: Promise<{ category: string }>
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params
  return {
    title: `${blockCategoryLabels[category] ?? "Blocks"} blocks`,
    description: "Whole screens made from PREDICT components, ready to copy.",
  }
}

export default async function Page({ params }: CategoryPageProps) {
  const { category } = await params
  if (!blockCategories.includes(category)) notFound()

  return <BlocksPage category={category} />
}
