import { Footer } from "@/src/components/layout/footer"
import { Header } from "@/src/components/layout/header"
import { NeuroNoise } from "@paper-design/shaders-react"

interface MarketingLayoutProps {
    children: React.ReactNode
}

export default async function MarketingLayout({
    children,
}: MarketingLayoutProps) {
    return (
        <>
            <Header />
            <NeuroNoise
            className="absolute top-0 -z-20 w-full h-full"
            scale={0.5}
            colorFront="#ffffff"
            colorMid="#8606fe"
            colorBack="#00000000"
            brightness={0.015}
            contrast={1}
            speed={0.3}
          />
            
            <main className="flex-1 border-y mt-16 border-dashed">{children}</main>
            <Footer />
        </>
    )
}