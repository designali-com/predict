import { db } from "@workspace/db/client"
import { peekWelcomeLink } from "@workspace/db/staff-welcome"
import { WelcomeForm } from "./welcome-form"

/**
 * A new staff member's first sign-in: choose a password, and they are in.
 * Public on purpose — the link itself is the key.
 */
export default async function WelcomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const who = await peekWelcomeLink(db, token)

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border p-6">
        {who ? (
          <>
            <div className="space-y-1">
              <h1 className="page-title">Welcome, {who.name.split(" ")[0]}</h1>
              <p className="text-sm text-muted-foreground">
                Choose a password for <b className="text-foreground">{who.email}</b>. You will use it to sign in from now
                on.
              </p>
            </div>
            <WelcomeForm token={token} />
          </>
        ) : (
          <div className="space-y-2 text-center">
            <h1 className="page-title">This link no longer works</h1>
            <p className="text-sm text-muted-foreground">
              It has expired or was already used. Ask your clinic admin to send you a new one, or sign in if you have
              already set your password.
            </p>
            <a href="/login" className="inline-block pt-2 text-sm font-medium text-primary hover:underline">
              Go to sign in
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
