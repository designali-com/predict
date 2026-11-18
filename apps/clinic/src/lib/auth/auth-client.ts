import { createAuthClient } from "better-auth/react";
import { DEFAULT_LOGIN_REDIRECT } from "./config";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [adminClient(), emailOTPClient()],
});

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