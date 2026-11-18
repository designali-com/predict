import { sendMail } from "../mailer";
import type { ChannelAdapter, SendParams, SendResult } from "./types";

// Plain-text email. Subject is the template's header, body is its body text
// (+ footer), both rendered with the send's values; a caller can still
// override either with variables.subject / variables.body.
//
// The transport — the clinic's SMTP mailbox or Resend — is chosen by
// ../mailer from the environment; this adapter only shapes the message.
export const emailAdapter: ChannelAdapter = {
  async send(params: SendParams): Promise<SendResult> {
    const subject = String(params.variables.subject ?? (params.renderedSubject || params.templateKey));
    const text = String(params.variables.body ?? params.renderedBody ?? "");
    if (!text.trim()) {
      return { status: "failed", error: `email template "${params.templateKey}" has no body text` };
    }

    const result = await sendMail({ to: params.to, subject, text });

    return result.ok
      ? { status: "sent", providerMessageId: result.messageId }
      : { status: "failed", error: result.error };
  },
};
