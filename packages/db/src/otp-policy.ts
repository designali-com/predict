import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte } from "drizzle-orm";
import { otpDelivery } from "./schema";
import type * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

/**
 * How a sign-in code is allowed to reach somebody.
 *
 * WhatsApp first, because it costs a fraction of an SMS and arrives with a
 * copy button. Three tries there; then — or as soon as WhatsApp refuses
 * outright — SMS unlocks, and the person chooses it. It is never switched to
 * silently: an SMS is a cost the clinic pays per message, and SMS pumping
 * (bots requesting codes to premium numbers) is the commonest way an OTP
 * form gets abused. So SMS is gated, capped and counted.
 *
 * Everything here is decided from otp_delivery rows, on the server. The
 * browser is told what the rule allows; it does not get to decide.
 */
export const OTP_POLICY = {
  /** Attempts are counted inside a rolling window of this many minutes. */
  windowMinutes: 15,
  whatsappAttempts: 3,
  smsAttempts: 2,
  /** Minimum gap between two sends to one number, on any channel. */
  cooldownSeconds: 30,
} as const;

export type OtpChannel = "whatsapp" | "sms";
export type OtpDeliveryStatus = "sent" | "failed" | "withheld";

export interface OtpState {
  whatsappUsed: number;
  smsUsed: number;
  whatsappLeft: number;
  smsLeft: number;
  /** The most recent WhatsApp attempt was refused by Meta — SMS opens at once. */
  lastWhatsAppFailed: boolean;
  /** SMS may be chosen: WhatsApp is used up, or it just failed. */
  smsUnlocked: boolean;
  /** Seconds left on the resend cooldown; 0 when a send is allowed now. */
  cooldownSeconds: number;
  /** Seconds until the oldest counted attempt leaves the window. */
  windowResetsInSeconds: number;
}

export async function otpState(db: Db, phone: string, now = new Date()): Promise<OtpState> {
  const since = new Date(now.getTime() - OTP_POLICY.windowMinutes * 60_000);

  const rows = await db
    .select({
      channel: otpDelivery.channel,
      status: otpDelivery.status,
      createdAt: otpDelivery.createdAt,
    })
    .from(otpDelivery)
    .where(and(eq(otpDelivery.phone, phone), gte(otpDelivery.createdAt, since)))
    .orderBy(desc(otpDelivery.createdAt));

  // Withheld rows count exactly like sent ones. If they did not, a number
  // with no account would run out of attempts at a different rate from a
  // real patient's, and the difference would tell anyone watching which
  // numbers belong to the clinic's patients.
  const whatsappUsed = rows.filter((r) => r.channel === "whatsapp").length;
  const smsUsed = rows.filter((r) => r.channel === "sms").length;

  const lastWhatsApp = rows.find((r) => r.channel === "whatsapp");
  const lastWhatsAppFailed = lastWhatsApp?.status === "failed";

  const whatsappLeft = Math.max(0, OTP_POLICY.whatsappAttempts - whatsappUsed);
  const smsLeft = Math.max(0, OTP_POLICY.smsAttempts - smsUsed);

  const newest = rows[0]?.createdAt;
  const cooldownSeconds = newest
    ? Math.max(0, Math.ceil(OTP_POLICY.cooldownSeconds - (now.getTime() - newest.getTime()) / 1000))
    : 0;

  const oldest = rows[rows.length - 1]?.createdAt;
  const windowResetsInSeconds = oldest
    ? Math.max(
        0,
        Math.ceil((oldest.getTime() + OTP_POLICY.windowMinutes * 60_000 - now.getTime()) / 1000),
      )
    : 0;

  return {
    whatsappUsed,
    smsUsed,
    whatsappLeft,
    smsLeft,
    lastWhatsAppFailed,
    smsUnlocked: whatsappLeft === 0 || lastWhatsAppFailed,
    cooldownSeconds,
    windowResetsInSeconds,
  };
}

export type OtpDecision =
  | { allowed: true; channel: OtpChannel }
  | {
      allowed: false;
      code: "COOLDOWN" | "SMS_LOCKED" | "WHATSAPP_EXHAUSTED" | "EXHAUSTED";
      message: string;
      retryAfterSeconds: number;
    };

/**
 * May a code be sent now, and on which channel.
 *
 * The requested channel is honoured or refused — never swapped. A person
 * who asked for WhatsApp and quietly got an SMS has been charged for a
 * decision they did not make.
 */
export function decideOtpChannel(state: OtpState, requested: OtpChannel = "whatsapp"): OtpDecision {
  if (state.cooldownSeconds > 0) {
    return {
      allowed: false,
      code: "COOLDOWN",
      message: `Please wait ${state.cooldownSeconds} seconds before asking for another code.`,
      retryAfterSeconds: state.cooldownSeconds,
    };
  }

  const minutes = Math.max(1, Math.ceil(state.windowResetsInSeconds / 60));

  if (requested === "sms") {
    if (!state.smsUnlocked) {
      return {
        allowed: false,
        code: "SMS_LOCKED",
        message: "SMS opens after the WhatsApp attempts.",
        retryAfterSeconds: 0,
      };
    }
    if (state.smsLeft === 0) {
      return {
        allowed: false,
        code: "EXHAUSTED",
        message: `Too many codes requested. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        retryAfterSeconds: state.windowResetsInSeconds,
      };
    }
    return { allowed: true, channel: "sms" };
  }

  if (state.whatsappLeft > 0) return { allowed: true, channel: "whatsapp" };

  return state.smsLeft > 0
    ? {
        allowed: false,
        code: "WHATSAPP_EXHAUSTED",
        message: "WhatsApp attempts used up — you can get the code by SMS instead.",
        retryAfterSeconds: 0,
      }
    : {
        allowed: false,
        code: "EXHAUSTED",
        message: `Too many codes requested. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        retryAfterSeconds: state.windowResetsInSeconds,
      };
}

export async function recordOtpDelivery(
  db: Db,
  row: {
    phone: string;
    channel: OtpChannel;
    status: OtpDeliveryStatus;
    providerMessageId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  await db.insert(otpDelivery).values({
    phone: row.phone,
    channel: row.channel,
    status: row.status,
    providerMessageId: row.providerMessageId ?? null,
    error: row.error ?? null,
  });
}
