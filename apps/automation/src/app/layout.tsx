import { Inter } from "next/font/google"
import type { Metadata, Viewport } from "next"
import "@workspace/ui/globals.css"
import { DemoBanner } from "@workspace/ui/components/demo-mode"
import { cn } from "@workspace/ui/lib/utils"
import { ThemeProvider } from "@/src/components/theme-provider"
import { THEME_SCRIPT } from "@workspace/ui/components/theme"
import { clinicContext } from "@/src/lib/auth/clinic"

const inter = Inter({ subsets: ["latin"] })

// Typed, and noindex like the clinic panel: this console holds the lead list,
// every WhatsApp thread and the campaign history, and it is never linked
// publicly. It was a bare `{ title }` object with no type, so nothing checked
// it and nothing else was set — a page opened here showed the same two words
// whichever screen it was, and the tab had no icon.
//
// Each clinic runs the console under its own name, as the clinic panel does:
// the tab reads "Leads | OPTM Ops" for OPTM's staff, the icon is /brand-icon
// (the clinic's own, or its initial). Signed out, it is plain "Operations".
export async function generateMetadata(): Promise<Metadata> {
  const clinic = (await clinicContext().catch(() => null))?.clinic
  const brand = clinic ? clinic.shortName || clinic.name : null
  const app = brand ? `${brand} Operations` : "Operations"
  return {
    title: { default: app, template: `%s | ${brand ? `${brand} Ops` : "Operations"}` },
    description: "Operations console — leads, conversations, campaigns and automations.",
    applicationName: app,
    icons: { icon: "/brand-icon" },
    robots: { index: false, follow: false },
    // A lead list is full of phone numbers this app already knows what to do
    // with. iOS linkifying them turns every row into a dial prompt.
    formatDetection: { telephone: false, date: false, address: false, email: false },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

// Same shell as the clinic panel: one font, one theme provider, surfaces
// painted from the design tokens rather than from bg-card/bg-primary. That is
// what makes the two panels look like one product instead of two — and it is
// also the only way dark mode can work here at all, since a hard-coded white
// has nothing to switch to.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(inter.className, "dark antialiased density-compact")} style={{ colorScheme: "dark" }}>
      <head>
        {/* Runs before first paint so the page never flashes the wrong
            theme. In the server-rendered document rather than in a client
            component, because React does not execute a script rendered on
            the client — it only warns about it. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <DemoBanner />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
