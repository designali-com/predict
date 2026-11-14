import { headers } from "next/headers"
import { auth } from "@/src/lib/auth/auth"
import { db } from "@workspace/db/client"
import { PatientAiChat } from "@/src/components/dashboard/user/ai/chat"
import { patientDashboard } from "@workspace/db/patient-dashboard"
import { cleanName } from "@/src/components/dashboard/user/dashboard-data"

/**
 * The quick questions offered in the chat, made from this patient's own
 * results.
 *
 * They were a fixed list — Glucose, Thyroid, Ferritin — and tapping one the
 * lab never ran got "that is not in your readings", which reads as the
 * assistant failing rather than the button being wrong. Every chip and
 * suggestion here names something that is actually on file, worst first.
 */
async function patientPrompts(userId: string) {
  const report = await patientDashboard(db, { userId })
  // Already ordered worst-first.
  const measured = report.biomarkers.filter((b) => b.status !== "Unknown")
  const out = measured.filter((b) => b.status === "High" || b.status === "Low")

  const topics = measured.slice(0, 7).map((b) => ({
    label: b.shortCode,
    // The full name goes to the model; the chip shows the short one.
    prompt: `Tell me about my ${b.name} (${b.shortCode}) results.`,
  }))

  const suggestions: string[] = []
  const worst = out[0]
  if (worst) suggestions.push(`Why is my ${worst.shortCode} ${worst.status.toLowerCase()}?`)
  if (out.length > 1) suggestions.push("Which of my markers are out of range?")
  const index = report.indexes[0]
  if (index) {
    suggestions.push("Explain my biological age result")
    const top = [...index.domains]
      .filter((d) => d.measured)
      .sort((a, b) => (b.shareOfDelta ?? 0) - (a.shareOfDelta ?? 0))[0]
    if (top) suggestions.push(`How is my ${cleanName(top.name, top.shortCode)} looking?`)
  }
  const inRange = measured.find((b) => b.status === "Normal")
  if (inRange) suggestions.push(`What was my last ${inRange.shortCode} reading?`)
  suggestions.push("What reports do I have on file?")

  return { topics, suggestions: suggestions.slice(0, 4) }
}

export default async function PredictAI() {
  const session = await auth.api.getSession({ headers: await headers() })

  // Opens on a new chat, like Gemini or ChatGPT — earlier ones are in the
  // history. Reopening the last one put somebody who came to ask something
  // new into the middle of an old conversation.
  const prompts = session ? await patientPrompts(session.user.id) : { topics: [], suggestions: [] }

  return (
    <div className="h-[calc(100svh-var(--header-height)-1.2rem)] p-2 md:p-4">
      <PatientAiChat
        initialMessages={[]}
        topics={prompts.topics}
        suggestions={prompts.suggestions}
      />
    </div>
  )
}
