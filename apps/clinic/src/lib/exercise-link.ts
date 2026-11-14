import { createHmac, timingSafeEqual } from "node:crypto"
import { CLINIC_URL } from "@/src/lib/auth/config"

/**
 * The patient's own link to their exercise plan — opened from WhatsApp, with
 * no login. The token is the contact's id signed with the auth secret, so it
 * cannot be guessed or walked from one patient to the next, and nothing has
 * to be stored for it. It shows the plan only; the chart stays behind sign-in.
 */

const SECRET = process.env.BETTER_AUTH_SECRET ?? ""

function signature(contactId: string): string {
  return createHmac("sha256", SECRET).update(`exercise-plan:${contactId}`).digest("base64url").slice(0, 22)
}

export function exercisePlanToken(contactId: string): string {
  return `${contactId.replace(/-/g, "")}${signature(contactId)}`
}

/** The contact the token was made for, or null when it is not one of ours. */
export function contactFromExercisePlanToken(token: string): string | null {
  if (!SECRET || !/^[0-9a-f]{32}[\w-]{22}$/.test(token)) return null
  const hex = token.slice(0, 32)
  const contactId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  const given = Buffer.from(token.slice(32))
  const expected = Buffer.from(signature(contactId))
  return given.length === expected.length && timingSafeEqual(given, expected) ? contactId : null
}

export function exercisePlanUrl(contactId: string): string {
  return `${CLINIC_URL.replace(/\/$/, "")}/e/${exercisePlanToken(contactId)}`
}
