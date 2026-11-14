import { NextResponse } from "next/server"
import { db } from "@workspace/db/client"
import { ingestLead } from "@workspace/db/lead-intake"
import { contact } from "@workspace/db/schema"
import { eq } from "@workspace/db"

/**
 * Sign-ups for a talk or event page on this site. Each one goes in as a
 * website lead, through the same ingestLead() as every ad and form, so the
 * person shows up in Ops with their answers on the profile and is deduped
 * against anyone already there by phone.
 */
// source is what Ops shows as where the lead came from; campaign and formName
// name the exact registration page, so these never read as a generic website lead.
const EVENTS: Record<string, { formName: string; campaign: string; source: string }> = {
  "optm-knee-pain-12-nov": {
    formName: "OPTM Knee Pain Talk Registration (12 Nov, 6 PM)",
    campaign: "OPTM Knee Pain Talk Registration - 12 Nov",
    source: "OPTM_KNEE_TALK_FORM",
  },
}

const hits = new Map<string, number[]>()
function rateLimited(ip: string) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > 10
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const event = typeof body?.event === "string" ? EVENTS[body.event] : undefined
  if (!event) return NextResponse.json({ error: "Unknown event" }, { status: 400 })

  // Honeypot: bots fill the hidden field; they get a normal success.
  if (body.website) return NextResponse.json({ ok: true })

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim()
  if (ip && rateLimited(ip)) return NextResponse.json({ error: "Too many tries, please wait a few minutes" }, { status: 429 })

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
  const digits = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : ""
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : ""
  const years = typeof body.years === "string" ? body.years.trim().slice(0, 50) : ""

  if (!name) return NextResponse.json({ error: "Please enter your name" }, { status: 400 })
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits
  if (!/^[6-9]\d{9}$/.test(local)) {
    return NextResponse.json({ error: "Please enter a valid 10-digit mobile number" }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 })
  }
  if (!years) return NextResponse.json({ error: "Please tell us how long you've had knee pain" }, { status: 400 })

  // Where the link was opened from (?utm_source=whatsapp on the group link).
  const platform =
    typeof body.utm_source === "string" && /^[\w-]{1,30}$/.test(body.utm_source) ? body.utm_source.toUpperCase() : "WEBSITE"

  try {
    const result = await ingestLead(db, {
      provider: "website",
      externalId: crypto.randomUUID(),
      name,
      phone: `91${local}`,
      email: email || null,
      answers: {
        "Registered for": event.formName,
        Name: name,
        Mobile: `+91 ${local}`,
        ...(email ? { Email: email } : {}),
        "Years of knee pain": years,
      },
      formName: event.formName,
      campaignName: event.campaign,
      platform,
      raw: body,
      submittedAt: new Date(),
      source: event.source,
    })
    if (result.status === "unmatched") return NextResponse.json({ error: "Could not register, please try again" }, { status: 400 })
    // Someone already in Ops (an earlier ad lead) keeps their old source on the
    // contact, so the Leads list never showed they registered. Their latest
    // action is this registration; the ad they came from stays in the lead
    // form history on their profile.
    if (result.status === "existing" && result.contactId) {
      await db
        .update(contact)
        .set({ source: event.source, campaign: event.campaign, lastTouchAt: new Date(), updatedAt: new Date() })
        .where(eq(contact.id, result.contactId))
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[event-registration] failed:", err)
    return NextResponse.json({ error: "Something went wrong, please try again" }, { status: 500 })
  }
}
