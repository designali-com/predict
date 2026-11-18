import { Footer } from "@/src/components/layout/footer"
import { Header } from "@/src/components/layout/header"

export default function ScreensLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="min-h-screen flex-1">{children}</main>
      <Footer />
    </>
  )
}
