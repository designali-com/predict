"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@workspace/ui/components/button";
import LoginForm from "@/src/components/auth/login-form";
import { Card, CardContent } from "@workspace/ui/components/card";
import { authClient, signInWithGoogle } from "@/src/lib/auth/auth-client";
import { DemoSignIn } from "@workspace/ui/components/demo-mode";
import { Marker, MarkerContent } from "@workspace/ui/components/marker";
import EmailOtpForm from "@/src/components/auth/email-otp";

export default function LoginClient() {
  return (
    <div className="flex h-screen pb-10 z-10 relative md:grid-cols-2 gap-6 items-center justify-center">

      <div className="flex flex-col items-center w-full max-w-md gap-6">
        <h1 className="text-center font-medium text-xl">
          Welcome to Predict <br />
          Start Moving Better in 7 days
        </h1>
        <DemoSignIn
          accounts={[
            { label: "Clinic admin", email: "admin@demo.predict.fit", hint: "Patients, courses, billing, stock, reports" },
            { label: "Front desk", email: "desk@demo.predict.fit", hint: "Today's schedule, arrivals, payments" },
            { label: "Doctor", email: "doctor@demo.predict.fit", hint: "Consultations, prescriptions, exercise plans" },
            { label: "Predict (diagnosis)", email: "predict@demo.predict.fit", hint: "Blood tests, biomarkers, health reports" },
          ]}
          signIn={async (email, password) => {
            const { error } = await authClient.signIn.email({ email, password });
            return error ? error.message || "Could not sign in to the demo" : null;
          }}
          onDone={() => {
            window.location.href = "/";
          }}
        />
        <Card className="w-full bg-transparent ring-0">
          <CardContent className="flex flex-col gap-4 pt-6">
            <LoginForm />
            <Marker className="py-3" variant="separator">
              <MarkerContent>OR</MarkerContent>
            </Marker>
            <div className="flex hidden flex-col gap-2 w-full">

              <Button
                size={"xl"}
                variant="simple"
                className="w-full flex items-center justify-center cursor-pointer"
                type="button"
                onClick={signInWithGoogle}
              >

                Continue with Email
              </Button>

            </div>
            <EmailOtpForm />

          </CardContent>
        </Card>
      </div>
      <div className="md:flex hidden items-center w-full max-w-md">
        <Image
          src="/images/running.png"
          alt="Hero"
          width={200}
          height={200}
          className="object-contain rounded-[30px] border p-2 h-fit w-full"
        />

      </div>
    </div>
  );
}
