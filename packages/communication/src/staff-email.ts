import { sendMail } from "./mailer";

/**
 * Email to our own staff — an escalation, a new-lead notice.
 *
 * Deliberately not sendCommunication(): that path is for contacts, and it
 * checks *their* marketing consent, logs to their conversation and needs a
 * template. Telling a telecaller about a lead is none of those things.
 *
 * Never throws: a sweep must not stop because a mail server is down.
 */
export async function sendStaffEmail(params: { to: string; subject: string; body: string }): Promise<boolean> {
  const result = await sendMail({ to: params.to, subject: params.subject, text: params.body });

  if (!result.ok) {
    console.warn(`[automation] staff email not sent (${params.subject} → ${params.to}): ${result.error}`);
  }
  return result.ok;
}
