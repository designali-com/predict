import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Index } from "@/registry/__index__"
import { blocks } from "@/registry/registry-blocks"

export const dynamicParams = false

export function generateStaticParams() {
  return blocks.map((block) => ({ name: block.name }))
}

interface ViewPageProps {
  params: Promise<{ name: string }>
}

export async function generateMetadata({ params }: ViewPageProps): Promise<Metadata> {
  const { name } = await params
  const block = blocks.find((item) => item.name === name)

  return {
    title: name,
    description: block?.description,
    robots: { index: false },
  }
}

export default async function ViewPage({ params }: ViewPageProps) {
  const { name } = await params
  const Component = blocks.some((block) => block.name === name)
    ? Index[name]?.component
    : undefined

  if (!Component) notFound()

  return <Component />
}
