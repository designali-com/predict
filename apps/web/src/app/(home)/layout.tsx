import { Footer } from "@/src/components/layout/footer"
import { Header } from "@/src/components/layout/header"


export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div >
      <Header />

      <div>
        {children}

      </div>
      <Footer />
    </div>
  )
}
