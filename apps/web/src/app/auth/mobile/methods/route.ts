import { NextResponse } from "next/server";

import { auth } from "@/src/lib/auth/auth";

/**
 * Which sign-in methods this server offers — the apps draw a button only for
 * what is here. Password and the emailed code are always on; Google and Apple
 * depend on credentials being set; the phone code goes out on WhatsApp (SMS
 * as the fallback) for numbers with an account.
 */
export async function GET() {
  const social = auth.options.socialProviders ?? {};
  const google = Boolean(social.google && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return NextResponse.json(
    {
      password: true,
      code: true,
      google,
      apple: false,
      appleNative: false,
      phone: true,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
