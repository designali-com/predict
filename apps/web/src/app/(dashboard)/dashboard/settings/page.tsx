"use client"

import { useEffect, useState } from "react"
import { PredictSpinner } from "@/src/components/predict-loader"
import { Lock, Smartphone } from "lucide-react"

import { ActiveSessions } from "@/src/components/dashboard/user/settings/active-sessions"
import { EmailCard } from "@/src/components/dashboard/user/settings/email-card"
import { PasswordRow } from "@/src/components/dashboard/user/settings/password-row"

function Section({ icon: Icon, title, hint, children }: { icon: typeof Lock; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3 sm:px-5">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{hint}</span>
      </div>
      {children}
    </section>
  )
}

/**
 * Settings, compact: how you sign in (email and password, each a row that
 * opens only when you choose to change it) and where you are signed in.
 */
export default function SettingsPage() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)

  useEffect(() => {
    fetch("/api/patient/profile/settings")
      .then((res) => (res.ok ? res.json() : { hasPassword: false }))
      .then((data) => setHasPassword(Boolean(data.hasPassword)))
      .catch(() => setHasPassword(false))
  }, [])

  if (hasPassword === null) {
    return (
      // Centred under the header, like every other page's loader.
      <div className="flex min-h-[calc(100svh-var(--header-height)-2rem)] w-full items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  return (
    <div className="w-full p-4 md:p-6">
      {/* PAGE HEADER — the same heading as Biomarker Overview. */}
      <div className="mb-6 max-w-3xl md:mb-8">
        <h1 className="text-xl font-medium tracking-tight md:text-2xl">Account Settings</h1>
        <p className="mt-3 text-sm text-muted-foreground">How you sign in, and the devices you are signed in on.</p>
      </div>

      <div className="flex max-w-3xl flex-col gap-4">
        <Section icon={Lock} title="Sign-in" hint="Mobile number always works">
          <div className="divide-y">
            <EmailCard />
            <PasswordRow hasPassword={hasPassword} onSaved={() => setHasPassword(true)} />
          </div>
        </Section>

        <Section icon={Smartphone} title="Signed-in devices" hint="Sign out any you don't recognise">
          <div className="p-3 sm:p-4">
            <ActiveSessions />
          </div>
        </Section>
      </div>
    </div>
  )
}
