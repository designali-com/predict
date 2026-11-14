import { sendWhatsAppAuthCode } from "./adapters/whatsapp";
import { sendSmsOtp } from "./sms";

/**
 * Put a sign-in code on somebody's phone, on the channel already decided.
 *
 * This does not choose the channel — see @workspace/db/otp-policy, which
 * decides from the attempt history — and it does not generate or check the
 * code; better-auth does both. It only delivers, and reports back plainly
 * whether the provider took the message.
 *
 * "Took" is all anybody can know at this point. WhatsApp accepts a message
 * to a number that has no WhatsApp and only reports the failure later, by
 * webhook; an SMS can be accepted and then dropped by the operator. That is
 * why the fallback is driven by attempts as well as by errors: a person who
 * has asked three times has not received it, whatever the API said.
 */

export type OtpChannel = "whatsapp" | "sms";

export interface OtpDeliveryResult {
  ok: boolean;
  channel: OtpChannel;
  messageId?: string;
  error?: string;
}

export async function deliverOtp(params: {
  /** Stored form: country code and digits, no "+". */
  phone: string;
  code: string;
  channel: OtpChannel;
}): Promise<OtpDeliveryResult> {
  if (params.channel === "sms") {
    const sms = await sendSmsOtp(params.phone, params.code);
    return { ok: sms.ok, channel: "sms", messageId: sms.messageId, error: sms.error };
  }

  const template = process.env.WHATSAPP_OTP_TEMPLATE?.trim();
  if (!template) {
    // Failing here — rather than skipping WhatsApp silently — is what opens
    // the SMS option straight away when the template has not been approved
    // yet, instead of making somebody wait out three attempts that could
    // never have arrived.
    return {
      ok: false,
      channel: "whatsapp",
      error: "WHATSAPP_OTP_TEMPLATE is not set — no approved authentication template to send with",
    };
  }

  const sent = await sendWhatsAppAuthCode(params.phone, params.code, {
    name: template,
    language: process.env.WHATSAPP_OTP_TEMPLATE_LANG?.trim() || "en_US",
  });

  return {
    ok: sent.status === "sent",
    channel: "whatsapp",
    messageId: sent.providerMessageId,
    error: sent.error,
  };
}
