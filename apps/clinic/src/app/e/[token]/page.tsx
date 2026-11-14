import type { CSSProperties } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Flame, Phone, Repeat, Target, Timer } from "lucide-react"
import { db } from "@workspace/db/client"
import { clinic, contact } from "@workspace/db/schema"
import { eq } from "@workspace/db"
import { getExerciseProtocolPrint } from "@workspace/db/exercise-protocol-store"
import { hindiExercisePlan, type HindiPlan } from "@workspace/db/exercise-hindi"
import { contactFromExercisePlanToken } from "@/src/lib/exercise-link"
import { ExerciseVideo } from "@/src/components/exercise-plan/exercise-video"

/**
 * The patient's exercise plan, opened from the "View exercise plan" button on
 * WhatsApp. No login: the signed token in the address is the key
 * (src/lib/exercise-link.ts). Phone-first, each exercise with its video
 * playing right here, in the clinic's colour — the patient is the clinic's.
 *
 * Only a plan the doctor has activated shows; a draft reads as no such page.
 *
 * English, or everyday Hindi with ?lang=hi — the plan itself translated too
 * (@workspace/db/exercise-hindi), the videos the same.
 */

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: { absolute: "Your exercise plan" },
  robots: { index: false, follow: false },
}

/** The clinic has not set its colour: Predict's own. */
const FALLBACK_COLOR = "#8504FE"

/**
 * The number to dial: the last one listed. "+91 7428 444 617, 618" is two
 * lines written short — the second only its last digits — so it becomes
 * "+917428444618".
 */
function dialable(phone: string | null | undefined): string | null {
  const m = /(\+?\d[\d\s-]{7,}\d)((?:\s*[,/]\s*\d+)*)/.exec(phone ?? "")
  if (!m) return null
  const first = m[1]!.replace(/[\s-]/g, "")
  const last = m[2]?.split(/[,/]/).pop()?.trim()
  if (!last) return first
  // A whole number of its own, or the tail of the first.
  return last.length >= 7 ? last : first.slice(0, first.length - last.length) + last
}

const blank = (v: string | null | undefined) => !v || v.trim() === "" || v.trim() === "—"

type Lang = "en" | "hi"

/** How long the page waits for a first translation before showing English. */
const HINDI_WAIT_MS = 15_000

/** The promise's value, or null if it takes longer than `ms`. */
function withinTime<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))])
}

/** A Hindi line where there is a usable one, the English otherwise. */
function pick(hindi: unknown, english: string): string {
  return typeof hindi === "string" && hindi.trim() ? hindi : english
}

/** A Hindi list when it lines up with the English one, the English otherwise. */
function pickList(hindi: unknown, english: string[]): string[] {
  return Array.isArray(hindi) && hindi.length === english.length ? english.map((e, i) => pick(hindi[i], e)) : english
}

/**
 * The plan in Hindi, field by field: anything the translation left out or got
 * wrong stays in English rather than going blank. Videos and the rest are the
 * English plan's own.
 */
function inHindi<P extends HindiPlan & { exercises: (HindiPlan["exercises"][number] & { videoUrl?: string })[] }>(
  english: P,
  hindi: HindiPlan,
): P {
  const ex = Array.isArray(hindi.exercises) ? hindi.exercises : []
  return {
    ...english,
    title: pick(hindi.title, english.title),
    goal: pick(hindi.goal, english.goal),
    duration: pick(hindi.duration, english.duration),
    schedule: pick(hindi.schedule, english.schedule),
    warmup: pick(hindi.warmup, english.warmup),
    followUp: pick(hindi.followUp, english.followUp),
    exercises: english.exercises.map((e, i) => {
      const h = ex[i] ?? ({} as Partial<HindiPlan["exercises"][number]>)
      return {
        ...e,
        name: pick(h.name, e.name),
        sets: pick(h.sets, e.sets),
        reps: pick(h.reps, e.reps),
        hold: pick(h.hold, e.hold),
        frequency: pick(h.frequency, e.frequency),
        notes: pick(h.notes, e.notes),
      }
    }),
    precautions: pickList(hindi.precautions, english.precautions),
    instructions: pickList(hindi.instructions, english.instructions),
  }
}

const TEXT = {
  en: {
    yourPlan: "Your exercise plan",
    hi: (name: string) => `Hi ${name}`,
    by: (doctor: string) => `, prescribed by ${doctor}`,
    goal: "Goal",
    duration: "Duration",
    when: "When",
    followUp: "Follow-up",
    warmup: "Warm up first",
    exercises: (n: number) => `${n} exercise${n === 1 ? "" : "s"}`,
    sets: "Sets",
    reps: "Reps",
    hold: "Hold",
    often: "How often",
    noVideo: "No video for this one",
    careful: "Be careful",
    goodToKnow: "Good to know",
    stop: "Stop and contact the clinic if the pain gets worse or anything new appears.",
    call: (clinic: string) => `Call ${clinic}`,
    callShort: "Call the clinic",
    play: "Tap to play",
    open: "Open video",
  },
  hi: {
    yourPlan: "आपका एक्सरसाइज़ प्लान",
    hi: (name: string) => `नमस्ते ${name}`,
    by: (doctor: string) => `, ${doctor} ने दिया है`,
    goal: "लक्ष्य",
    duration: "कितने दिन",
    when: "कब करें",
    followUp: "फॉलो-अप",
    warmup: "पहले वार्म-अप करें",
    exercises: (n: number) => `${n} एक्सरसाइज़`,
    sets: "सेट",
    reps: "रेप्स",
    hold: "होल्ड",
    often: "कितनी बार",
    noVideo: "इसका वीडियो नहीं है",
    careful: "ध्यान रखें",
    goodToKnow: "काम की बातें",
    stop: "दर्द बढ़े या कोई नई परेशानी हो, तो एक्सरसाइज़ रोकें और क्लिनिक से बात करें।",
    call: (clinic: string) => `${clinic} को कॉल करें`,
    callShort: "क्लिनिक को कॉल करें",
    play: "चलाने के लिए टैप करें",
    open: "वीडियो खोलें",
  },
} as const

export default async function ExercisePlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { token } = await params
  const contactId = contactFromExercisePlanToken(token)
  if (!contactId) notFound()
  const data = await getExerciseProtocolPrint(db, contactId)
  if (!data || !data.active) notFound()

  // The clinic's brand colour, as --brand: the accents and the play buttons take it.
  const brandColor = await db
    .select({ color: clinic.brandColor })
    .from(contact)
    .innerJoin(clinic, eq(clinic.id, contact.clinicId))
    .where(eq(contact.id, contactId))
    .then((r) => r[0]?.color || FALLBACK_COLOR)

  // Hindi when asked for. Whatever goes wrong with it — the AI down, slow or
  // returning something odd — the patient quietly gets the English page: never
  // an error, never a blank. A slow first translation carries on in the
  // background and is there next time.
  const english = data.protocol
  let lang: Lang = (await searchParams).lang === "hi" ? "hi" : "en"
  let hindi: HindiPlan | null = null
  if (lang === "hi") {
    hindi = await withinTime(
      hindiExercisePlan(db, contactId).catch((error) => {
        console.error("[exercise-plan] Hindi failed:", error)
        return null
      }),
      HINDI_WAIT_MS,
    )
    if (!hindi) lang = "en"
  }
  const t = TEXT[lang]
  // Spaced capitals suit English; spread out, Devanagari falls apart.
  const caps = lang === "en" ? "uppercase tracking-[0.2em]" : ""
  const smallCaps = lang === "en" ? "uppercase tracking-wide" : ""
  const p = hindi ? inHindi(english, hindi) : english
  const firstName = data.patient.name.split(" ")[0]
  const clinicName = data.clinic?.name ?? "Your clinic"
  const tel = dialable(data.clinic?.phone)
  const facts = [
    { icon: CalendarClock, label: t.duration, value: p.duration },
    { icon: Clock, label: t.when, value: p.schedule },
    { icon: Repeat, label: t.followUp, value: p.followUp },
  ].filter((f) => !blank(f.value))

  return (
    <div lang={lang} className="min-h-screen bg-neutral-100 text-neutral-900" style={{ colorScheme: "light", "--brand": brandColor } as CSSProperties}>
      <header className="bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png" alt={clinicName} className="h-10 w-10 object-contain" />
          <div className="flex items-center gap-2">
            <nav aria-label="Language" className="flex rounded-full border border-neutral-300 p-0.5 text-xs font-semibold">
              {(["en", "hi"] as const).map((l) => (
                <Link
                  key={l}
                  href={l === "en" ? `/e/${token}` : `/e/${token}?lang=hi`}
                  aria-current={lang === l ? "true" : undefined}
                  className={`rounded-full px-3 py-1 ${lang === l ? "text-white" : "text-neutral-600"}`}
                  style={lang === l ? { background: "var(--brand)" } : undefined}
                >
                  {l === "en" ? "English" : "हिंदी"}
                </Link>
              ))}
            </nav>
            {tel && (
              <a
                href={`tel:${tel}`}
                aria-label={t.callShort}
                title={t.callShort}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-300"
                style={{ color: "var(--brand)" }}
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
        <div className="h-1" style={{ background: "var(--brand)" }} />
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5">
        <section>
          <p className={`text-xs font-semibold ${caps}`} style={{ color: "var(--brand)" }}>
            {t.yourPlan}
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{p.title}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {t.hi(firstName ?? "")}
            {p.updated?.byName ? t.by(p.updated.byName) : ""}
            {lang === "hi" ? "।" : "."}
          </p>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          {!blank(p.goal) && (
            <p className="flex gap-2 text-sm">
              <Target className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--brand)" }} />
              <span>
                <b>{t.goal}:</b> {p.goal}
              </span>
            </p>
          )}
          {facts.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {facts.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-2 rounded-xl bg-[color-mix(in_srgb,var(--brand)_7%,white)] px-3 py-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--brand)" }} />
                  <div>
                    <p className={`text-[11px] font-medium text-neutral-500 ${smallCaps}`}>{label}</p>
                    <p className="text-sm font-semibold">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!blank(p.warmup) && (
            <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <Flame className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <b>{t.warmup}:</b> {p.warmup}
              </span>
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="px-1 text-sm font-semibold text-neutral-600">
            {t.exercises(p.exercises.length)}
          </h2>
          {p.exercises.map((e, i) => {
            const dose = [
              { label: t.sets, value: e.sets },
              { label: t.reps, value: e.reps },
              { label: t.hold, value: e.hold },
              { label: t.often, value: e.frequency },
            ].filter((d) => !blank(d.value))
            return (
              <article key={i} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="grid gap-4 p-4 md:grid-cols-[1fr_300px]">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ background: "var(--brand)" }}
                      >
                        {i + 1}
                      </span>
                      <h3 className="pt-1 text-base font-semibold leading-snug">{e.name}</h3>
                    </div>
                    {dose.length > 0 && (
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-2">
                        {dose.map((d) => (
                          <div key={d.label} className="rounded-lg border border-neutral-200 px-2.5 py-1.5">
                            <dt className={`text-[10px] font-medium text-neutral-500 ${smallCaps}`}>{d.label}</dt>
                            <dd className="text-sm font-semibold">{d.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {!blank(e.notes) && <p className="text-sm leading-relaxed text-neutral-700">{e.notes}</p>}
                  </div>
                  {e.videoUrl ? (
                    <ExerciseVideo url={e.videoUrl} title={e.name} labels={{ play: t.play, open: t.open }} />
                  ) : (
                    <div className="hidden items-center justify-center rounded-xl bg-neutral-50 text-xs text-neutral-400 md:flex">
                      <Timer className="mr-1.5 h-4 w-4" /> {t.noVideo}
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </section>

        {(p.precautions.length > 0 || p.instructions.length > 0) && (
          <section className="grid gap-3 md:grid-cols-2">
            {p.precautions.length > 0 && (
              <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
                <p className={`mb-2 text-xs font-bold text-red-700 ${smallCaps}`}>{t.careful}</p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {p.precautions.map((x, i) => (
                    <li key={i} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> {x}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {p.instructions.length > 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className={`mb-2 text-xs font-bold text-emerald-700 ${smallCaps}`}>{t.goodToKnow}</p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {p.instructions.map((x, i) => (
                    <li key={i} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {x}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <footer className="flex flex-col items-center gap-3 py-4 text-center text-xs text-neutral-500">
          <p>{t.stop}</p>
          {tel && (
            <a
              href={`tel:${tel}`}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--brand)" }}
            >
              <Phone className="h-4 w-4" /> {t.call(clinicName)}
            </a>
          )}
          {data.clinic?.address && <p>{data.clinic.address}</p>}
        </footer>
      </main>
    </div>
  )
}
