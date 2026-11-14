import { sendMail } from "@workspace/communication/mailer";

/**
 * Login codes and verification links.
 *
 * This used to call Resend with "onboarding@resend.dev" hard-coded as the
 * sender — an address Resend delivers only to the owner of the Resend
 * account. Every OTP this panel ever sent went to that one inbox and nobody
 * else, which is why nobody could sign in by code.
 *
 * It now goes through the shared mailer, from EMAIL_FROM, over whichever
 * transport is configured. Returns false rather than throwing, as before:
 * better-auth treats a throw from here as a failed sign-in, and the reason
 * is already logged.
 */
export async function sendEmail(payload: { to: string; subject: string; text: string }) {
  const result = await sendMail(payload);

  if (!result.ok) {
    console.error(`[auth email] not sent to ${payload.to} via ${result.provider}: ${result.error}`);
  }
  return result.ok;
}
