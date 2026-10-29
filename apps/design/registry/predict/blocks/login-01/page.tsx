"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { Logo } from "@workspace/ui/predict/logo"
import { PredictMascot } from "@workspace/ui/predict/predict-mascot"

export default function Page() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <Logo role="img" aria-label="PREDICT" className="h-10 size-30 self-start" />

        <div className="flex flex-1 items-center justify-center">
          <form
            className="flex w-full max-w-xs flex-col gap-6"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="flex flex-col gap-1 text-center">
              <h1 className="text-xl font-medium tracking-tight">Welcome back</h1>
              <p className="text-sm text-muted-foreground">
                Sign in to see your latest results.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="login-email">Email</Label>
              <Input id="login-email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password">Password</Label>
                <a href="#" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                  Forgot password?
                </a>
              </div>
              <Input id="login-password" type="password" required />
            </div>

            <Button type="submit">Sign in</Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>

            <Button type="button" variant="outline">
              Email me a sign-in link
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              New to PREDICT?{" "}
              <a href="#" className="text-foreground underline underline-offset-4">
                Book your first test
              </a>
            </p>
          </form>
        </div>
      </div>

      <div className="relative hidden flex-col items-center justify-center gap-8 overflow-hidden bg-muted p-10 lg:flex">
        <PredictMascot className="size-40" aria-hidden />
        <div className="flex max-w-sm flex-col gap-2 text-center">
          <p className="text-lg font-medium tracking-tight">Understand your biology</p>
          <p className="text-sm text-muted-foreground">
            40 biomarkers, read against healthy ranges and explained in plain words.
          </p>
        </div>
      </div>
    </div>
  )
}
