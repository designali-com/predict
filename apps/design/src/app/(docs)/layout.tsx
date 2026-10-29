import { Header } from "@/src/components/layout/header"

interface SiteLayoutProps {
  children: React.ReactNode
}

// Pages with the site header. Block previews in (view) render without it.
export default function SiteLayout({ children }: SiteLayoutProps) {
  return (
    <>
      <Header />
      <main className="min-h-screen flex-1">{children}</main>
    </>
  )
}
