import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/lib/auth/auth";
import { DEFAULT_LOGIN_REDIRECT } from "@/src/lib/auth/config";
import LoginClient from "./login-client";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect(DEFAULT_LOGIN_REDIRECT);
  }

  // Set by /l/<token> when a clinic sign-in link has expired or was revoked.
  const { link } = await searchParams;
  return <LoginClient linkExpired={link === "expired"} />;
}
