import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@workspace/db/client"
import { getExerciseProtocolPrint } from "@workspace/db/exercise-protocol-store"
import { ExerciseProtocolPrint } from "@workspace/ui/components/exercise-protocol-view"
import { contactFromExercisePlanToken } from "@/src/lib/exercise-link"

/**
 * The printed sheet, behind the plan's token instead of a sign-in — what the
 * PDF sent on WhatsApp is made from (src/lib/exercise-plan-send.ts), so it is
 * the very sheet staff print from the Exercise tab.
 */

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: { absolute: "Exercise prescription" },
  robots: { index: false, follow: false },
}

export default async function ExercisePlanSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const contactId = contactFromExercisePlanToken((await params).token)
  if (!contactId) notFound()
  const data = await getExerciseProtocolPrint(db, contactId)
  if (!data || !data.active) notFound()

  // The marker is what the WhatsApp PDF printer waits for: proof the page it
  // is about to print is this patient's sheet and not a 404 or an error page.
  return (
    <div data-exercise-sheet={contactId} style={{ display: "contents" }}>
      <ExerciseProtocolPrint protocol={data.protocol} patient={data.patient} clinic={data.clinic} savedAt={data.updatedAt} />
    </div>
  )
}
