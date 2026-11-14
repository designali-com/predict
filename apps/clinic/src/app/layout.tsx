import { Geist_Mono, Inter } from "next/font/google"
import type { Metadata, Viewport } from "next"

import "@workspace/ui/globals.css"
import { DemoBanner } from "@workspace/ui/components/demo-mode"
import { cn } from "@workspace/ui/lib/utils"
import { ThemeProvider } from "@/src/components/theme-provider"
import { THEME_SCRIPT } from "@workspace/ui/components/theme"
import { clinicContext } from "@/src/lib/auth/clinic"

// The same face the operations console loads, so the two panels do not look
// like two products. Applied on <html> rather than through --font-sans:
// globals.css points that variable at --font-montreal, which nothing in this
// app defines, so the declaration is dropped and body inherits from here.
const inter = Inter({ subsets: ["latin"] })

// Kept as a variable, not the page font: routes and keys are shown in
// font-mono where the difference between l and 1 matters.
const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

// No marketing metadata, no analytics, no OpenGraph: nothing here is ever
// linked publicly or indexed. noindex is set for the same reason — a staff
// panel showing up in search results is only ever a mistake.
//
// Each clinic runs the panel under its own name: the tab reads
// "Billing | OPTM" for OPTM's staff, "Billing | Apollo" for Apollo's. The
// clinic is the one the person signed in to; signed out, the panel is
// unbranded. The icon is /brand-icon, the clinic's own or its initial.
export async function generateMetadata(): Promise<Metadata> {
  const clinic = (await clinicContext().catch(() => null))?.clinic
  const brand = clinic ? clinic.shortName || clinic.name : "Clinic"
  return {
    title: { default: brand, template: `%s | ${brand}` },
    description: "Clinical panel — charts, appointments and care plans.",
    applicationName: brand,
    icons: { icon: "/brand-icon" },
    robots: { index: false, follow: false },
    // Patient ids, phone numbers and amounts are not phone numbers to dial or
    // addresses to map. iOS linkifies them by default and turns a chart into a
    // page of accidental tap targets.
    formatDetection: { telephone: false, date: false, address: false, email: false },
  }
}

export const viewport: Viewport = {
  // Matches the surfaces the panel actually paints, so the browser chrome on
  // a tablet does not sit in a colour this app never uses.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(inter.className, "dark antialiased", fontMono.variable)}
      style={{ colorScheme: "dark" }}
    >
      <head>
        {/* Runs before first paint so the page never flashes the wrong
            theme. In the server-rendered document rather than in a client
            component, because React does not execute a script rendered on
            the client — it only warns about it. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <DemoBanner />
        <ThemeProvider>
          <div className="bg-white dark:bg-black">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  )
}
