import type { Metadata } from "next"
import { CalendarDays, Clock, GraduationCap } from "lucide-react"
import { RegistrationForm } from "./registration-form"
import { DoctorPhoto } from "./doctor-photo"

export const metadata: Metadata = {
  title: { absolute: "Knee Pain? Surgery Isn't Your Only Option | OPTM Health Care" },
  description:
    "A talk by Dr. Akash Jaiswal (10 years at AIIMS), OPTM Consultant, on non-surgical solutions for knee pain. 12th November, 6 PM. Register to reserve your seat.",
  icons: { icon: "/optm/icon.png", apple: "/optm/icon.png" },
  openGraph: {
    title: "Knee Pain? Surgery Isn't Your Only Option",
    description: "Dr. Akash Jaiswal, OPTM Consultant · 12th November, 6 PM · Register to reserve your seat",
    siteName: "OPTM Health Care",
    // The WhatsApp link preview shows OPTM, not the Predict default image.
    images: [{ url: "/optm/logo.jpg", width: 1080, height: 1080, alt: "OPTM Health Care" }],
  },
}

export default function KneeTalkPage() {
  return (
    <main className="min-h-dvh bg-[#f3f5f2] text-[#0f1a14]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#133f26] px-4 pt-6 pb-28 text-white sm:pt-10">
        {/* The OPTM ring mark, large and faint, as texture. */}
        <img
          src="/optm/icon.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-20 w-72 opacity-[0.07] mix-blend-screen invert"
        />
        <div className="relative mx-auto max-w-md">
          {/* The logo file is the wordmark centred on this same green; cropping keeps it seamless. */}
          <img src="/optm/logo.jpg" alt="OPTM Health Care" className="-ms-4 h-12 w-32 object-cover" />

          <h1 className="mt-7 text-[2rem] leading-[1.1] font-semibold tracking-tight sm:text-4xl">
            Knee pain? Surgery isn&apos;t your only option.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/80">
            Explore non-surgical solutions for knee pain with an OPTM consultant, and get your questions answered.
          </p>

          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/[0.08] p-3 ring-1 ring-white/10">
            <DoctorPhoto />
            <div className="min-w-0">
              <p className="font-semibold">Dr. Akash Jaiswal</p>
              <p className="text-sm text-white/70">OPTM Consultant</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-white/60">
                <GraduationCap className="size-3.5" />
                10 years of experience at AIIMS
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Card overlapping the hero */}
      <section className="relative mx-auto -mt-20 max-w-md px-4 pb-10">
        <div className="rounded-3xl bg-white p-5 shadow-[0_12px_40px_-12px_rgba(19,63,38,0.25)] ring-1 ring-black/5 sm:p-6">
          <div className="grid grid-cols-2 gap-2">
            <Fact icon={<CalendarDays className="size-[18px]" />} label="Date" value="12th Nov" />
            <Fact icon={<Clock className="size-[18px]" />} label="Time" value="6:00 PM" />
          </div>

          <div className="my-5 h-px bg-[#e7ebe6]" />

          <h2 className="text-lg font-semibold tracking-tight">Reserve your seat</h2>
          <RegistrationForm event="optm-knee-pain-12-nov" />
        </div>

        <p className="mt-6 text-center text-xs text-[#7a877f]">© OPTM Health Care</p>
      </section>
    </main>
  )
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-[#f1f6ee] p-2.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#133f26] text-white">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium tracking-wide text-[#5b6b61] uppercase">{label}</p>
        <p className="text-[13px] leading-tight font-semibold whitespace-nowrap">{value}</p>
      </div>
    </div>
  )
}
