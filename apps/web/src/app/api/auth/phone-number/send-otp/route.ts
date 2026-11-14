import { NextResponse } from "next/server";
import { sendLoginOtp } from "@/src/lib/auth/send-login-otp";

/**
 * The mobile apps' phone-code send: `POST /api/auth/phone-number/send-otp`
 * with `{ phoneNumber: "+91…" }`, Better Auth's own path and body shape.
 *
 * This file takes the path ahead of the `[...all]` Better Auth handler on
 * purpose. Better Auth's endpoint sends to any number with no limit, and is
 * refused in auth.ts for that reason; here the same request goes through the
 * web login page's rules (lib/auth/send-login-otp.ts) — WhatsApp first, the
 * per-number limits, and only numbers that have an account.
 *
 * The app reads a 2xx as "sent", a 429 as "wait", and anything else as
 * "couldn't send to that number" — so a WhatsApp failure is not a 2xx here.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { phoneNumber?: unknown } | null;
  const phone = typeof body?.phoneNumber === "string" ? body.phoneNumber : "";
  if (phone.length < 6 || phone.length > 20) {
    return NextResponse.json({ error: "Enter a mobile number.", code: "INVALID_PHONE_NUMBER" }, { status: 400 });
  }

  const outcome = await sendLoginOtp(phone, "whatsapp");
  if (outcome.status === 200 && !outcome.delivered) {
    return NextResponse.json({ ...outcome.body, code: "OTP_NOT_DELIVERED" }, { status: 502 });
  }
  return NextResponse.json(outcome.body, { status: outcome.status });
}
