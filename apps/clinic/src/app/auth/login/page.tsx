import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/lib/auth/auth";
import { panelRedirectFor } from "@/src/lib/auth/permissions";
import LoginClient from "./login-client";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    // Not a fixed home: a patient or a coach signing in here belongs in a
    // different app, and sending them to /doctor would bounce them straight
    // back to this page.
    redirect(await panelRedirectFor(session.user));
  }

  return <LoginClient />;
}
