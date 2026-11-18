import { createAuthClient } from "better-auth/react";
import { DEFAULT_LOGIN_REDIRECT } from "./config";
import { adminClient, emailOTPClient, phoneNumberClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [adminClient(), emailOTPClient(), phoneNumberClient()],
});

export type OtpChannel = "whatsapp" | "sms";

/** What /api/login-otp/send reports back — the rules, never whether the account exists. */
export interface PhoneOtpResponse {
  phone?: string;
  maskedPhone?: string;
  channel?: OtpChannel;
  delivered?: boolean;
  message?: string;
  error?: string;
  code?: "COOLDOWN" | "SMS_LOCKED" | "WHATSAPP_EXHAUSTED" | "EXHAUSTED" | "NOT_REGISTERED";
  whatsappLeft?: number;
  smsLeft?: number;
  smsUnlocked?: boolean;
  cooldownSeconds?: number;
  retryAfterSeconds?: number;
}

/**
 * Ask for a sign-in code on a mobile number.
 *
 * Through our route, not better-auth's send endpoint — that one is shut,
 * because it sends to any number with no limit (see lib/auth/otp-context.ts).
 */
export async function sendPhoneOtp(phone: string, channel: OtpChannel = "whatsapp") {
  const response = await fetch("/api/login-otp/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, channel }),
  });
  const data = (await response.json().catch(() => ({}))) as PhoneOtpResponse;
  return { ok: response.ok, data };
}

/** Check the code and sign in. `phone` is the normalized number the send route returned. */
export async function verifyPhoneOtp(phone: string, code: string) {
  return authClient.phoneNumber.verify({ phoneNumber: phone, code });
}

export const signInWithGithub = async () => {
  await authClient.signIn.social({
    provider: "github",
    callbackURL: DEFAULT_LOGIN_REDIRECT,
  });
};

export const signInWithGoogle = async () => {
  await authClient.signIn.social({
    provider: "google",
    callbackURL: DEFAULT_LOGIN_REDIRECT,
  });
};

export const sendOTP = async (email: string) => {
  return await authClient.emailOtp.sendVerificationOtp({
    email,
    type: "sign-in", // sign-in ya email-verification
  });
};

// 👈 OTP Verify karke login karne ka function
export const verifyOTP = async (email: string, otp: string) => {
  return await authClient.signIn.emailOtp({
    email,
    otp,
  });
};

export const { useSession, signIn, signOut, updateUser, changePassword } = authClient;