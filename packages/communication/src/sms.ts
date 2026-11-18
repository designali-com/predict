/**
 * Text messages — used for sign-in codes when WhatsApp has not worked.
 *
 * Provider from SMS_PROVIDER:
 *
 *   msg91    The usual choice for India. Sends through a Flow template that
 *            MSG91 has tied to your DLT-registered template, so the wording
 *            lives in MSG91, not here. MSG91_AUTH_KEY, MSG91_OTP_TEMPLATE_ID,
 *            and MSG91_OTP_VAR if the template's variable is not called "otp".
 *   twilio   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM or
 *            TWILIO_MESSAGING_SERVICE_SID. Sends SMS_OTP_TEXT.
 *   console  Development only: prints the code to the server log instead of
 *            sending it. Refuses to run in production, where a code in a log
 *            and no message on the phone is a failure dressed as a success.
 *
 * India: every commercial SMS to an Indian number has to be sent under a
 * DLT-registered sender ID and template (TRAI). Without that registration
 * the operators drop the message after the provider has accepted it, so a
 * "sent" here can still never arrive. That is set up with the provider, not
 * in code.
 */

export type SmsProvider = "msg91" | "twilio" | "console" | "none";

export interface SmsResult {
  ok: boolean;
  provider: SmsProvider;
  messageId?: string;
  error?: string;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function smsProvider(): SmsProvider {
  const chosen = env("SMS_PROVIDER")?.toLowerCase();
  if (chosen === "msg91" || chosen === "twilio" || chosen === "console") return chosen;
  return "none";
}

/** The text sent by providers that take free text. Must match your DLT template exactly. */
function otpText(code: string): string {
  const template =
    env("SMS_OTP_TEXT") ??
    "{code} is your PREDICT login code. It expires in 5 minutes. Do not share it with anyone.";
  return template.replace(/\{code\}/g, code);
}

async function viaMsg91(phone: string, code: string): Promise<SmsResult> {
  const authKey = env("MSG91_AUTH_KEY");
  const templateId = env("MSG91_OTP_TEMPLATE_ID");
  if (!authKey || !templateId) {
    return { ok: false, provider: "msg91", error: "MSG91_AUTH_KEY or MSG91_OTP_TEMPLATE_ID is not set" };
  }

  try {
    const response = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: authKey, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        recipients: [{ mobiles: phone, [env("MSG91_OTP_VAR") ?? "otp"]: code }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const body = (await response.json().catch(() => null)) as { type?: string; message?: string } | null;
    if (!response.ok || body?.type === "error") {
      return { ok: false, provider: "msg91", error: body?.message ?? `HTTP ${response.status}` };
    }
    return { ok: true, provider: "msg91", messageId: body?.message };
  } catch (error) {
    return { ok: false, provider: "msg91", error: error instanceof Error ? error.message : String(error) };
  }
}

async function viaTwilio(phone: string, code: string): Promise<SmsResult> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM");
  const service = env("TWILIO_MESSAGING_SERVICE_SID");
  if (!sid || !token || !(from || service)) {
    return {
      ok: false,
      provider: "twilio",
      error: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID) are needed",
    };
  }

  const form = new URLSearchParams({ To: `+${phone}`, Body: otpText(code) });
  if (service) form.set("MessagingServiceSid", service);
  else form.set("From", from!);

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });

    const body = (await response.json().catch(() => null)) as { sid?: string; message?: string } | null;
    if (!response.ok) return { ok: false, provider: "twilio", error: body?.message ?? `HTTP ${response.status}` };
    return { ok: true, provider: "twilio", messageId: body?.sid };
  } catch (error) {
    return { ok: false, provider: "twilio", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Send a sign-in code by SMS. Never throws.
 *
 * `phone` is in the stored form — country code and digits, no "+".
 */
export async function sendSmsOtp(phone: string, code: string): Promise<SmsResult> {
  const digits = phone.replace(/\D/g, "");

  switch (smsProvider()) {
    case "msg91":
      return viaMsg91(digits, code);
    case "twilio":
      return viaTwilio(digits, code);
    case "console":
      if (process.env.NODE_ENV === "production") {
        return {
          ok: false,
          provider: "console",
          error: "SMS_PROVIDER=console is for development — set msg91 or twilio in production",
        };
      }
      console.log(`[sms:console] OTP for +${digits}: ${code}`);
      return { ok: true, provider: "console", messageId: "console" };
    default:
      return { ok: false, provider: "none", error: "SMS_PROVIDER is not set (msg91 | twilio | console)" };
  }
}
