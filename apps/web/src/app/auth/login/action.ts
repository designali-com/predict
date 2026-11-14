"use server";

import { headers } from "next/headers";
import { auth } from "@/src/lib/auth/auth";
import { APIError } from "better-auth/api";
import { ActionResult } from "@/src/lib/auth/schemas";
import { db } from "@workspace/db/client";
import { contact, user } from "@workspace/db/schema";
import { and, eq, isNotNull } from "@workspace/db";
import { normalizePhone } from "@workspace/db/normalize-phone";
import { isPlaceholderEmail } from "@workspace/db/login-link";

/** One answer for every failure, so the form never says which numbers have accounts. */
const WRONG = "Wrong mobile/email or password.";

/**
 * The account's email, from an email or a mobile number.
 *
 * Patients are registered at the clinic by phone and many have no email they
 * use, so a number must work here too. Matched on the number the account signs
 * in with by OTP first, then on the patient's contact record. A number that
 * belongs to more than one account — a family phone — is not guessed between.
 */
async function emailFor(identifier: string): Promise<string | null | "ambiguous"> {
  const value = identifier.trim();
  // A mobile-only account's placeholder address is not a way in: email
  // sign-in starts when the patient adds a real one in Settings.
  if (value.includes("@")) return isPlaceholderEmail(value) ? null : value.toLowerCase();

  const phone = normalizePhone(value);
  if (!phone.ok) return null;

  const byLogin = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.phoneNumber, phone.phone))
    .limit(2);
  if (byLogin.length === 1) return byLogin[0]!.email;
  if (byLogin.length > 1) return "ambiguous";

  const byContact = await db
    .selectDistinct({ email: user.email })
    .from(contact)
    .innerJoin(user, eq(user.id, contact.userId))
    .where(and(eq(contact.phone, phone.phone), isNotNull(contact.userId)))
    .limit(2);
  if (byContact.length === 1) return byContact[0]!.email;
  if (byContact.length > 1) return "ambiguous";
  return null;
}

export async function loginUser({
  identifier,
  password,
}: {
  /** An email address or a mobile number. */
  identifier: string;
  password: string;
}): Promise<ActionResult<{ user: { id: string; email: string } }>> {
  try {
    const email = await emailFor(identifier);
    if (email === "ambiguous") {
      return {
        error: { reason: "This number is on more than one account. Sign in with your email, or with a code." },
        success: null,
      };
    }
    if (!email) return { error: { reason: WRONG }, success: null };

    // With the request's headers, so the session records the browser and IP.
    // Without them every password sign-in was saved with neither, and Settings →
    // Active Sessions could only call each one "Unknown device".
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });

    return {
      success: { reason: "Login successful" },
      error: null,
      data: undefined,
    };
  } catch (err) {
    if (err instanceof APIError) {
      // better-auth's own wording names the email; ours does not name either.
      return { error: { reason: WRONG }, success: null };
    }
    return { error: { reason: "Something went wrong." }, success: null };
  }
}
