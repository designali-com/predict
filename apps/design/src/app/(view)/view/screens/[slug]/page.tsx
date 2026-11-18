import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { appThemeClass } from "@/src/components/screens/phone-frame"
import { screenGroups } from "@/src/components/screens/registry"

const allScreens = screenGroups.flatMap((group) => group.screens)

export const dynamicParams = false

export function generateStaticParams() {
  return allScreens.map((screen) => ({ slug: screen.slug }))
}

interface ScreenViewPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ theme?: string }>
}

export async function generateMetadata({ params }: ScreenViewPageProps): Promise<Metadata> {
  const { slug } = await params
  const screen = allScreens.find((item) => item.slug === slug)
  return { title: screen?.title ?? slug, robots: { index: false } }
}

// A single app screen at 100%, without site chrome. `?theme=light|dark`
// forces the app theme; otherwise it follows the site theme.
export default async function ScreenViewPage({ params, searchParams }: ScreenViewPageProps) {
  const { slug } = await params
  const { theme } = await searchParams
  const screen = allScreens.find((item) => item.slug === slug)
  if (!screen) notFound()

  const Component = screen.component
  return (
    <div className={appThemeClass(theme === "light" || theme === "dark" ? theme : undefined)}>
      <Component />
    </div>
  )
}
