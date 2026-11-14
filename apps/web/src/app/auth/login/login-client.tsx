"use client";
import { Button } from "@workspace/ui/components/button"

import { useState } from "react";
import Image from "next/image";
import LoginForm from "@/src/components/auth/login-form";
import { Card, CardContent } from "@workspace/ui/components/card";
import EmailOtpForm from "@/src/components/auth/email-otp";
import PhoneOtpForm from "@/src/components/auth/phone-otp";
import { DemoSignIn } from "@workspace/ui/components/demo-mode";
import { authClient } from "@/src/lib/auth/auth-client";

type Mode = "phone" | "password" | "email";

/**
 * Sign-in: a code on WhatsApp to the mobile number first.
 *
 * Patients are registered at the clinic by phone, most have no email they use,
 * and a code needs nothing remembered — so that is the whole screen to begin
 * with. A password (with the mobile number or an email) is there for anybody
 * who has set one, behind a link rather than beside the code, so the first
 * thing a patient sees is the one way that always works.
 */
export default function LoginClient({ linkExpired = false }: { linkExpired?: boolean }) {
  const [mode, setMode] = useState<Mode>("phone");

  const link =
    "text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

  return (
    <div className="relative z-10 flex h-screen items-center justify-center gap-6 pb-10 md:grid-cols-2">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <h1 className="text-center text-xl font-medium">
          Welcome to Predict <br />
          Start Moving Better in 7 days
        </h1>
        <DemoSignIn
          accounts={[
            { label: "Demo patient", email: "patient@demo.predict.fit", hint: "Biological age, health domains, every biomarker, the health report" },
          ]}
          signIn={async (email, password) => {
            const { error } = await authClient.signIn.email({ email, password });
            return error ? error.message || "Could not sign in to the demo" : null;
          }}
          onDone={() => {
            window.location.href = "/dashboard";
          }}
        />
        <Card className="w-full bg-transparent ring-0">
          <CardContent className="flex flex-col gap-4 pt-6">
            {linkExpired && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                This sign-in link has expired. Sign in with your mobile number instead.
              </p>
            )}
            {mode === "phone" && <PhoneOtpForm />}
            {mode === "password" && <LoginForm />}
            {mode === "email" && <EmailOtpForm />}

            <div className="flex flex-col items-center gap-2 pt-1">
              {mode === "phone" ? (
                <Button variant="ghost" size="default" type="button" onClick={() => setMode("password")} className={link}>
                  Sign in with password instead
                </Button>
              ) : (
                <Button variant="ghost" size="default" type="button" onClick={() => setMode("phone")} className={link}>
                  Sign in with mobile number instead
                </Button>
              )}
              {mode !== "email" && (
                <Button variant="ghost" size="default" type="button" onClick={() => setMode("email")} className={`${link} opacity-70`}>
                  Sign in with email instead
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="hidden w-full max-w-md items-center md:flex">
        <Image
          src="/images/running.png"
          alt="Hero"
          width={200}
          height={200}
          className="h-fit w-full rounded-[30px] border object-contain p-2"
        />
      </div>
    </div>
  );
}
