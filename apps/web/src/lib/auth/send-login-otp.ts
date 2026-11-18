import { db } from "@workspace/db/client";
import { user } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { normalizePhone } from "@workspace/db/normalize-phone";
import {
  decideOtpChannel,
  otpState,
  recordOtpDelivery,
  type OtpChannel,
  type OtpState,
} from "@workspace/db/otp-policy";
import { auth } from "./auth";
import { otpSendContext, type OtpSendContext } from "./otp-context";

/** What the page is told about the rules — never whether the account exists. */
function publicState(state: OtpState) {
  return {
    whatsappLeft: state.whatsappLeft,
    smsLeft: state.smsLeft,
    smsUnlocked: state.smsUnlocked,
    cooldownSeconds: state.cooldownSeconds,
  };
}

/** "+91 98•••• 3210" — enough to recognise, not enough to copy. */
function mask(phone: string): string {
  const national = phone.startsWith("91") && phone.length === 12 ? phone.slice(2) : phone;
  const cc = national === phone ? "" : "+91 ";
  return `${cc}${national.slice(0, 2)}••••${national.slice(-4)}`;
}

/** What a send answered: the HTTP status and the JSON body, for whichever route is asking. */
export interface LoginOtpOutcome {
  status: number;
  body: Record<string, unknown>;
  /** True only when a code actually left on a channel. */
  delivered: boolean;
}

const respond = (body: Record<string, unknown>, init?: { status?: number }): LoginOtpOutcome => ({
  status: init?.status ?? 200,
  body,
  delivered: body.delivered === true,
});

/**
 * Send a sign-in code to a mobile number — WhatsApp first, SMS on request —
 * under the attempt limits, and only to numbers with an account. Shared by
 * the web login page (/api/login-otp/send) and the mobile apps
 * (/api/auth/phone-number/send-otp), so both doors have the same rules.
 */
export async function sendLoginOtp(rawPhone: string, requested?: OtpChannel): Promise<LoginOtpOutcome> {
  const normalized = normalizePhone(rawPhone);
  if (!normalized.ok) {
    return respond({ error: "That does not look like a mobile number." }, { status: 400 });
  }
  const phone = normalized.phone;

  const before = await otpState(db, phone);
  const decision = decideOtpChannel(before, requested ?? "whatsapp");

  if (!decision.allowed) {
    return respond(
      {
        error: decision.message,
        code: decision.code,
        retryAfterSeconds: decision.retryAfterSeconds,
        phone,
        maskedPhone: mask(phone),
        ...publicState(before),
      },
      { status: decision.code === "SMS_LOCKED" ? 400 : 429 },
    );
  }

  const channel = decision.channel;
  const account = await db.query.user.findFirst({
    columns: { id: true, banned: true },
    where: eq(user.phoneNumber, phone),
  });

  let delivered: boolean;
  let failure: string | null = null;

  if (!account || account.banned) {
    // Nothing is sent, and now the page says so plainly. It used to answer
    // exactly as for a patient — "code sent" — so nobody could test numbers;
    // the clinic chose telling a patient who typed the wrong number over
    // that. The attempt still counts against the limits, which is what stops
    // anyone running through numbers to see which are registered.
    await recordOtpDelivery(db, { phone, channel, status: "withheld", error: "no account" });
    return respond(
      {
        error: "This number is not registered with Predict.",
        code: "NOT_REGISTERED",
      },
      { status: 404 },
    );
  } else {
    const context: OtpSendContext = { channel };

    try {
      await otpSendContext.run(context, () =>
        auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone } }),
      );
    } catch (error) {
      context.result ??= {
        ok: false,
        channel,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const result = context.result ?? { ok: false, channel, error: "no delivery result" };
    delivered = result.ok;
    failure = result.ok ? null : (result.error ?? "unknown error");

    await recordOtpDelivery(db, {
      phone,
      channel,
      status: result.ok ? "sent" : "failed",
      providerMessageId: result.messageId ?? null,
      error: failure,
    });

    if (failure) console.error(`[login-otp] ${channel} to ${mask(phone)} failed: ${failure}`);
  }

  const after = await otpState(db, phone);

  return respond({
    phone,
    maskedPhone: mask(phone),
    channel,
    delivered,
    // The provider's reason stays in the server log. The page only needs to
    // know what to offer next.
    message: delivered
      ? channel === "whatsapp"
        ? "Code sent on WhatsApp."
        : "Code sent by SMS."
      : channel === "whatsapp"
        ? "We couldn't send the code on WhatsApp. You can get it by SMS instead."
        : "We couldn't send the SMS. Please try again in a minute.",
    ...publicState(after),
  });
}
