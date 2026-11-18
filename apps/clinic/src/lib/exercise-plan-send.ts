import { tmpdir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { db } from "@workspace/db/client"
import { communicationTemplate } from "@workspace/db/schema"
import { eq } from "@workspace/db"
import { getExerciseProtocol } from "@workspace/db/exercise-protocol-store"
import { sendCommunication } from "@workspace/communication"
import { uploadFile } from "@workspace/storage"
import { contactFromExercisePlanToken, exercisePlanToken } from "@/src/lib/exercise-link"

/**
 * Sending the patient their exercise plan on WhatsApp — staff press "Send on
 * WhatsApp" once it is active; activating alone sends nothing:
 * the printed sheet as a PDF, and a "View exercise plan" button to the
 * no-login page with the videos (src/app/e/[token]).
 *
 * The PDF is the Exercise tab's own print sheet (src/app/e/[token]/sheet),
 * printed by a headless Chrome on this server — so the two never drift apart.
 * Chrome is found at CHROME_PATH, or the usual places; a Linux server with
 * none uses the Chromium that ships inside the app (@sparticuz/chromium), so
 * nothing has to be installed on the machine.
 */

export const EXERCISE_PLAN_TEMPLATE = "exercise_plan"

/** THEME_STORAGE_KEY in @workspace/ui/components/theme — a client module, so restated here. */
const THEME_STORAGE_KEY = "predict-theme"

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
]

/** This server, reached directly — the sheet is rendered from here, not over the internet. */
const SELF = process.env.EXERCISE_PDF_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3002}`

const BASE_ARGS = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]

/** The browser to print with: an installed Chrome / Edge, else the bundled Chromium (Linux). */
async function browserToUse(): Promise<{ executablePath: string; args: string[] }> {
  const found = CHROME_CANDIDATES.find((p): p is string => !!p && existsSync(p))
  if (found) return { executablePath: found, args: BASE_ARGS }
  if (process.platform === "linux") {
    const chromium = (await import("@sparticuz/chromium")).default
    // Unpacked into /tmp on first use, then reused.
    const executablePath = await chromium.executablePath()
    // Its fonts are unpacked next to it, but it only points Fontconfig at them on AWS Lambda;
    // without this the renderer aborts on the first web font ("Navigating frame was detached").
    process.env.FONTCONFIG_PATH ||= join(tmpdir(), "fonts")
    return { executablePath, args: [...chromium.args, ...BASE_ARGS] }
  }
  throw new Error("No Chrome on this machine to make the PDF — install it or set CHROME_PATH")
}

/** One Chromium at a time on this server: two presses at once must not start two browsers. */
let printing: Promise<unknown> = Promise.resolve()
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = printing.then(job, job)
  printing = run.catch(() => undefined)
  return run
}

/** Patients whose plan is being sent right now — a double press sends once. */
const inFlight = new Set<string>()

/** Smallest real sheet: an error page printed to PDF is a few KB. */
const MIN_PDF_BYTES = 10_000

/**
 * The sheet as an A4 PDF, uploaded where WhatsApp can fetch it.
 *
 * Refuses rather than prints when the page is not this patient's sheet — a
 * 404, a sign-in page or an error printed to PDF would otherwise go to the
 * patient looking like their plan.
 */
export async function exercisePlanPdf(contactId: string, patientName: string): Promise<string> {
  // Demo: no Chromium on Vercel, and nothing is really sent — the sheet's own
  // page stands in for the PDF.
  if (process.env.DEMO_MODE !== "0") {
    return `${(process.env.NEXT_PUBLIC_CLINIC_URL ?? "").replace(/\/$/, "")}/e/${exercisePlanToken(contactId)}/sheet?for=${encodeURIComponent(patientName)}`
  }
  return oneAtATime(async () => {
    const { executablePath, args } = await browserToUse()
    const browser = await puppeteer.launch({ executablePath, headless: true, args })
    try {
      const page = await browser.newPage()
      page.setDefaultTimeout(30_000)
      // The sheet is printed light whatever the panel's theme.
      await page.evaluateOnNewDocument((key: string) => localStorage.setItem(key, "light"), THEME_STORAGE_KEY)
      const response = await page.goto(`${SELF}/e/${exercisePlanToken(contactId)}/sheet`, { waitUntil: "networkidle0", timeout: 30_000 })
      if (!response || response.status() !== 200) {
        throw new Error(`The exercise sheet did not load (HTTP ${response?.status() ?? "no response"})`)
      }
      // The page marks itself with the contact it was made for.
      const marker = await page.$(`[data-exercise-sheet="${contactId}"]`)
      if (!marker) throw new Error("The page printed was not this patient's exercise sheet")
      await page.evaluate(() => document.fonts.ready)
      const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true })
      if (pdf.length < MIN_PDF_BYTES) throw new Error("The exercise sheet PDF came out empty")
      const file = await uploadFile({
        visibility: "public",
        folder: "exercise-plans",
        fileName: `exercise-plan-${patientName}.pdf`,
        body: pdf,
        contentType: "application/pdf",
      })
      if (!file.url) throw new Error("The PDF was not uploaded")
      return file.url
    } finally {
      await browser.close().catch(() => undefined)
    }
  })
}

export type SendPlanResult = { sent: true } | { sent: false; reason: string }

/**
 * Send the active plan, now — each press is one message. Never throws: a
 * failure is the reason, for staff.
 *
 * Nothing goes unless all three are right: the PDF is this patient's own
 * sheet (never the template's approval sample), and the button's link opens
 * this patient's plan.
 */
export async function sendExercisePlan(contactId: string): Promise<SendPlanResult> {
  if (inFlight.has(contactId)) return { sent: false, reason: "Already sending this plan — wait a moment" }
  inFlight.add(contactId)
  try {
    const stored = await getExerciseProtocol(db, contactId)
    if (!stored?.active) return { sent: false, reason: "Activate the prescription first" }

    const [template] = await db
      .select({ status: communicationTemplate.submissionStatus, sample: communicationTemplate.headerMediaUrl })
      .from(communicationTemplate)
      .where(eq(communicationTemplate.key, EXERCISE_PLAN_TEMPLATE))
    if (template?.status !== "approved") return { sent: false, reason: "The WhatsApp template is waiting for Meta's approval" }

    // The link: without the signing secret the token is unsigned and the
    // button opens "not found". Check it reads back as this patient.
    const token = exercisePlanToken(contactId)
    if (contactFromExercisePlanToken(token) !== contactId) {
      return { sent: false, reason: "The plan link could not be made on this server (signing secret missing)" }
    }

    const p = stored.protocol
    const patient = await db.query.contact.findFirst({ columns: { name: true }, where: (c, { eq }) => eq(c.id, contactId) })
    const name = patient?.name?.trim() || "there"
    const headerMediaUrl = await exercisePlanPdf(contactId, name)
    if (!headerMediaUrl || headerMediaUrl === template.sample) {
      return { sent: false, reason: "The patient's PDF was not made — nothing was sent" }
    }

    const result = await sendCommunication({
      contactId,
      templateKey: EXERCISE_PLAN_TEMPLATE,
      variables: {
        name: name.split(" ")[0],
        title: p.title,
        duration: [p.duration, p.schedule].filter((v) => v?.trim()).join(", ") || "as advised",
      },
      headerMediaUrl,
      requireHeaderMedia: true,
      buttonParameters: [token],
      idempotencyKey: `exercise-plan:${contactId}:${Date.now()}`,
    })
    return result.status === "sent"
      ? { sent: true }
      : { sent: false, reason: `WhatsApp: ${result.error ?? result.status}` }
  } catch (error) {
    console.error("[exercise-plan] send failed:", error)
    return { sent: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    inFlight.delete(contactId)
  }
}
