import type { Metadata } from "next"

import { ScreensGallery } from "@/src/components/screens/screens-gallery"

export const metadata: Metadata = {
  title: "App Screens",
  description: "Every phone screen of the PREDICT mobile app, built with the PREDICT UI kit.",
}

export default function ScreensPage() {
  return <ScreensGallery />
}
