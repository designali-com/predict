import type { Metadata } from "next"

import { BlocksPage } from "@/src/components/blocks/blocks-page"

export const metadata: Metadata = {
  title: "Blocks",
  description: "Whole screens made from PREDICT components, ready to copy.",
}

export default function Page() {
  return <BlocksPage />
}
