"use client"

import { useId, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { DemoSignIn } from "@workspace/ui/components/demo-mode"
import { authClient } from "@/src/lib/auth/auth-client"
import { Logo } from "@/src/components/logo"
import { PredictSpinner } from "@/src/components/predict-loader"

/**
 * The operations console's sign-in — the same look as the clinic panel and
 * the patient site, so staff moving between them see one product. Staff only:
 * email and password (a new member sets theirs from their welcome link).
 */
export default function LoginPage() {
  const router = useRouter()
  const passwordId = useId()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [visible, setVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: signInError } = await authClient.signIn.email({ email: email.trim(), password })
    if (signInError) {
      // Only a 401 really means "wrong email or password". A 404 or 500 is the
      // server not answering — saying "invalid password" then sends people
      // hunting for a password that was right all along.
      setError(
        signInError.status === 403 && /banned/i.test(signInError.message ?? "")
          ? "This account has been switched off. Ask your clinic admin."
          : signInError.status === 401
            ? signInError.message || "Invalid email or password"
            : `Could not reach the sign-in service (error ${signInError.status ?? "?"}). Try again in a moment.`,
      )
      setSubmitting(false)
      return
    }

    // "/" resolves server-side to where this person actually belongs — which
    // may be a different app. Pushing straight to /home sent anyone without
    // ops.access into a bounce between /home and /login.
    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="fixed z-50 w-full border-b border-dashed bg-background/80 py-2 backdrop-blur">
        <nav className="container mx-auto flex h-12 items-center justify-center px-2">
          <Logo className="size-30 pb-0.5" />
        </nav>
      </header>

      <div className="relative mx-auto min-h-svh max-w-7xl border-x border-dashed px-6">
        <div className="relative z-10 flex min-h-svh items-center justify-center gap-10 pb-10 pt-20">
          <div className="flex w-full max-w-md flex-col items-center gap-8">
            <div className="text-center">
              <h1 className="text-xl font-medium">Welcome to Predict Operations</h1>
              <p className="mt-1 text-sm text-muted-foreground">Sign in with your staff account</p>
            </div>

            <DemoSignIn
              accounts={[
                { label: "Operations manager", email: "ops@demo.predict.fit", hint: "Leads, call queue, WhatsApp, reports, ad ROI" },
                { label: "Telecaller", email: "caller@demo.predict.fit", hint: "Their own leads and the call queue" },
              ]}
              signIn={async (demoEmail, demoPassword) => {
                const { error: e } = await authClient.signIn.email({ email: demoEmail, password: demoPassword })
                return e ? e.message || "Could not sign in to the demo" : null
              }}
              onDone={() => {
                router.push("/")
                router.refresh()
              }}
            />

            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
              {error && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              <Input
                type="email"
                placeholder="you@predict.fit"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 px-8"
              />
              <div className="relative">
                <Input
                  id={passwordId}
                  type={visible ? "text" : "password"}
                  placeholder="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 px-8"
                />
                <Button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  aria-label={visible ? "Hide password" : "Show password"}
                  aria-pressed={visible}
                  aria-controls={passwordId} variant="ghost" className="absolute inset-y-0 end-0 mr-3 h-full w-9">
                  {visible ? <EyeOffIcon size={16} aria-hidden /> : <EyeIcon size={16} aria-hidden />}
                </Button>
              </div>
              <Button size="xl" type="submit" className="w-full" disabled={submitting}>
                {submitting && <PredictSpinner className="size-4" />}
                {submitting ? "Logging in..." : "Login"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                New here? Open the welcome link your admin sent you. Forgot your password? Ask your clinic admin.
              </p>
            </form>
          </div>

          <div className="hidden w-full max-w-md items-center md:flex">
            <Image
              src="/images/running.png"
              alt=""
              width={400}
              height={520}
              priority
              className="h-fit w-full rounded-[30px] border object-contain p-2"
            />
          </div>
        </div>

        {/* The same purple glow at the foot of the page as the clinic and patient sign-in. */}
        <div
          className="absolute inset-0 z-0"
          style={{ background: "radial-gradient(400% 100% at 50% 10%, var(--background) 70%, #8504FE 100%)" }}
        />
      </div>
    </div>
  )
}
