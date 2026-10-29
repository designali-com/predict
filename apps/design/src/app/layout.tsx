import { Geist_Mono } from "next/font/google"
import type { Metadata } from "next"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/src/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils";
import { NeueMontreal } from "@/src/lib/fonts"; 

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "PREDICT",
    template: `%s | PREDICT`,
  },

  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://predict.fit"
  ),

  description:
    "PREDICT uses advanced biomarkers and personalised health insights to help you understand your biological age, muscle health, and long-term health risks.",

  keywords: [
    "PREDICT",
    "biological age",
    "muscle age",
    "biomarkers",
    "health assessment",
    "longevity",
    "preventive healthcare",
    "personalised health",
    "metabolic health",
    "muscle health",
  ],

  authors: [
    {
      name: "PREDICT",
      url: "https://predict.fit",
    },
  ],

  creator: "PREDICT",

  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://predict.fit",
    title: "PREDICT | Understand Your Biology",
    description:
      "Discover what your biomarkers reveal about your biological age, muscle health, and long-term health.",
    siteName: "PREDICT",
    images: [
      {
        url: `${process.env.NEXT_PUBLIC_APP_URL || "https://predict.fit"}/opengraph-image.png`,
        width: 1200,
        height: 630,
        alt: "PREDICT",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "PREDICT | Understand Your Biology",
    description:
      "Advanced biomarker insights for personalised health, muscle health, and longevity.",
    images: [
      `${process.env.NEXT_PUBLIC_APP_URL || "https://predict.fit"}/opengraph-image.jpg`,
    ],
  },

  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },

  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", NeueMontreal.variable)}
    >
      <body>
        <ThemeProvider>
          <div className="bg-white dark:bg-black">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  )
}
