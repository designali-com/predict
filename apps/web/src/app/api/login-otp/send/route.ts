import { NextResponse } from "next/server";
import { z } from "zod";
import { sendLoginOtp } from "@/src/lib/auth/send-login-otp";

/**
 * Send a sign-in code to a mobile number — WhatsApp first, SMS on request.
 *
 * The only way a code leaves this app for the web page: better-auth's own
 * send endpoint is shut to anything without the policy (see otp-context.ts).
 * The rules live in lib/auth/send-login-otp.ts, shared with the mobile apps.
 */

const bodySchema = z.object({
  phone: z.string().min(6).max(20),
  channel: z.enum(["whatsapp", "sms"]).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a mobile number." }, { status: 400 });
  }
  const outcome = await sendLoginOtp(parsed.data.phone, parsed.data.channel);
  return NextResponse.json(outcome.body, { status: outcome.status });
}
