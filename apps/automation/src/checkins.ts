import { db } from "@workspace/db/client";
import {
  clinicalFormSubmission,
  communicationMessage,
  communicationTemplate,
  planEnrollment,
  planEnrollmentItem,
} from "@workspace/db/schema";
import { and, desc, eq, gte, inArray, isNotNull, isNull, like } from "@workspace/db";
import { sendCommunication, sendTextMessage } from "@workspace/communication";
import { EXERCISE_ACTIVE_STATUS, EXERCISE_FORM_KEY } from "@workspace/db/exercise-protocol-store";
import { PROTOCOL_FORM_KEY as DIET_FORM_KEY } from "@workspace/db/diet-protocol-store";
import { recordCheckin } from "@workspace/db/checkin-log";
import { getCheckinSettings } from "@workspace/db/checkin-settings";
import type { ExerciseProtocol } from "@workspace/db/exercise-protocol";
import {
  CHECKINS,
  addDays,
  checkinKey,
  checkinOption,
  istDate,
  kindsForButton,
  parseCheckinKey,
  type CheckinKind,
  type CheckinScore,
} from "@workspace/db/checkin";

/**
 * The daily check-ins: medicine, exercise and diet.
 *
 * Each morning at its set time (Automations → Daily check-ins; 9:00 IST
 * unless changed), a patient is asked about yesterday —
 * one WhatsApp template per kind (see @workspace/db/checkin) — for as long as
 * their plan runs:
 *
 *   medicine   while a course (plan_enrollment: 6, 21 or 42 days from its
 *              start date) is active and includes medicine
 *   exercise   while a course is active, or for the prescription's own
 *              duration from the day staff started its check-in — only while
 *              the check-in is on
 *   diet       while a course is active, or for DIET_DAYS after the
 *              nutritionist wrote the protocol
 *
 * Never about a day before the plan or prescription began. A tap comes back
 * through the webhook (recordCheckinReply) and lands in checkin_log against
 * the day it was about, which the patient's profile shows.
 *
 * Nothing of a kind goes out while it is switched off or until Meta has
 * approved its template — both are read every run.
 */

/** An exercise prescription with no readable duration is checked on for this long. */
const EXERCISE_DEFAULT_DAYS = 42;
/** A diet protocol outside a course is checked on for this long after it is written. */
const DIET_DAYS = 42;

/** "6 weeks" → 42, "30 days" → 30, "2 months" → 60; null when it says nothing usable. */
export function durationDays(text: string | null | undefined): number | null {
  const m = /(\d+)\s*(day|week|month)/i.exec(text ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  return unit === "day" ? n : unit === "week" ? n * 7 : n * 30;
}

/** Minutes since midnight, India time. */
function istMinutes(at = new Date()): number {
  const ist = new Date(at.getTime() + 5.5 * 3600_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** Inclusive day ranges, as YYYY-MM-DD strings. */
type Window = { from: string; to: string };
const covers = (w: Window, day: string) => day >= w.from && day <= w.to;

/** Who is on an active course on `day`, and whether that course has medicine. */
async function courseWindows(day: string): Promise<Map<string, { window: Window; medicine: boolean }>> {
  const rows = await db
    .select({
      id: planEnrollment.id,
      contactId: planEnrollment.contactId,
      startDate: planEnrollment.startDate,
      durationDays: planEnrollment.durationDays,
    })
    .from(planEnrollment)
    .where(and(eq(planEnrollment.status, "active"), isNotNull(planEnrollment.startDate)));

  const live = rows
    .map((r) => ({ ...r, window: { from: r.startDate!, to: addDays(r.startDate!, Math.max(1, r.durationDays) - 1) } }))
    .filter((r) => covers(r.window, day));
  if (!live.length) return new Map();

  const withMedicine = new Set(
    (
      await db
        .select({ enrollmentId: planEnrollmentItem.enrollmentId })
        .from(planEnrollmentItem)
        .where(and(inArray(planEnrollmentItem.enrollmentId, live.map((r) => r.id)), eq(planEnrollmentItem.kind, "medicine")))
    ).map((r) => r.enrollmentId),
  );

  const out = new Map<string, { window: Window; medicine: boolean }>();
  for (const r of live) {
    const prev = out.get(r.contactId);
    out.set(r.contactId, { window: r.window, medicine: (prev?.medicine ?? false) || withMedicine.has(r.id) });
  }
  return out;
}

/** Patient-level documents (exercise prescription, diet protocol) with when they were first written. */
async function documents(formKey: string) {
  return db
    .select({
      contactId: clinicalFormSubmission.contactId,
      answers: clinicalFormSubmission.answers,
      createdAt: clinicalFormSubmission.createdAt,
      status: clinicalFormSubmission.status,
    })
    .from(clinicalFormSubmission)
    .where(and(eq(clinicalFormSubmission.formKey, formKey), isNull(clinicalFormSubmission.appointmentId)));
}

/** Who should be asked about `day`, per kind. */
export async function dueFor(day: string): Promise<Record<CheckinKind, Set<string>>> {
  const due: Record<CheckinKind, Set<string>> = { medicine: new Set(), exercise: new Set(), diet: new Set() };
  const courses = await courseWindows(day);

  for (const [contactId, c] of courses) if (c.medicine) due.medicine.add(contactId);

  for (const row of await documents(EXERCISE_FORM_KEY)) {
    const p = row.answers as ExerciseProtocol;
    // A draft (not activated yet) is never asked about; an active one counts
    // from the day its check-in was started (older ones: from activation).
    if (row.status !== EXERCISE_ACTIVE_STATUS || !p?.dailyCheckIn) continue;
    const start = p.checkInStarted?.at ?? p.activated?.at;
    const from = istDate(start ? new Date(start) : row.createdAt);
    const own = { from, to: addDays(from, (durationDays(p.duration) ?? EXERCISE_DEFAULT_DAYS) - 1) };
    const course = courses.get(row.contactId)?.window;
    if (day >= from && (covers(own, day) || (course && covers(course, day)))) due.exercise.add(row.contactId);
  }

  for (const row of await documents(DIET_FORM_KEY)) {
    const from = istDate(row.createdAt);
    const own = { from, to: addDays(from, DIET_DAYS - 1) };
    const course = courses.get(row.contactId)?.window;
    if (day >= from && (covers(own, day) || (course && covers(course, day)))) due.diet.add(row.contactId);
  }
  return due;
}

let running = false;
/**
 * The day each kind was last sent about in full. Once a kind has gone to
 * everyone due, the rest of the day's ticks leave it alone instead of
 * re-checking every patient. A restart forgets this; the idempotency key on
 * every message means the next pass sends nothing twice.
 */
const finished = new Map<CheckinKind, string>();

/** The worker's tick. Idempotent per patient, kind and day — safe to call every few minutes. */
export async function sendDailyCheckins(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const settings = await getCheckinSettings(db);
    const now = istMinutes();
    const templates = await db
      .select({ key: communicationTemplate.key, status: communicationTemplate.submissionStatus })
      .from(communicationTemplate)
      .where(inArray(communicationTemplate.key, Object.values(CHECKINS).map((c) => c.template)));
    const approved = new Set(templates.filter((t) => t.status === "approved").map((t) => t.key));
    const kinds = (Object.keys(CHECKINS) as CheckinKind[]).filter(
      (k) =>
        settings[k].enabled &&
        now >= settings[k].hour * 60 + settings[k].minute &&
        approved.has(CHECKINS[k].template),
    );
    if (!kinds.length) return 0;

    const yesterday = istDate(new Date(), -1);
    const pending = kinds.filter((k) => finished.get(k) !== yesterday);
    if (!pending.length) return 0;
    const due = await dueFor(yesterday);

    let sent = 0;
    for (const kind of pending) {
      let failures = 0;
      for (const contactId of due[kind]) {
        try {
          const result = await sendCommunication({
            contactId,
            templateKey: CHECKINS[kind].template,
            idempotencyKey: checkinKey(kind, contactId, yesterday),
          });
          if (result.status === "sent") sent++;
        } catch (err) {
          failures++;
          console.error(`[checkin] ${kind} for ${contactId} failed:`, err);
        }
      }
      // A failed send is tried again on the next tick; a clean pass is done for the day.
      if (!failures) finished.set(kind, yesterday);
    }
    if (sent) console.log(`[checkin] sent ${sent} check-in(s) about ${yesterday}`);
    return sent;
  } finally {
    running = false;
  }
}

/** What the patient hears back after tapping. */
const THANKS: Record<CheckinKind, Record<CheckinScore, string>> = {
  medicine: {
    done: "Thank you! 💊 Recorded — keep taking them as prescribed.",
    partial: "Thanks for letting us know. Please take all your medicines today as prescribed — both oral and topical. 🙏",
    missed: "Thanks for telling us. Please don't skip your medicines — if something is stopping you, reply here and we will help.",
  },
  exercise: {
    done: "Great work! 💪 Recorded — keep it up today too.",
    partial: "Thanks for letting us know. Some is better than none — try to complete all of them today. 👍",
    missed: "Thanks for telling us. Try to fit them in today — even a short session helps. If something is stopping you (pain, time), reply here and we will help.",
  },
  diet: {
    done: "Excellent! 🥗 Recorded — keep following your plan.",
    partial: "Thanks for letting us know. Try to stick to the full plan today — small steps add up. 👍",
    missed: "Thanks for telling us. Let's get back on track today — reply here if you need help with your diet plan.",
  },
};

/**
 * A button tap that may be a check-in answer. `contextId` is Meta's id of the
 * message the patient replied to; failing that (some clients drop it), the
 * latest check-in in the last two days whose buttons include the one tapped.
 * Returns true when it was an answer and has been recorded.
 */
export async function recordCheckinReply(params: {
  contactId: string;
  contextId?: string | null;
  text: string | null | undefined;
  buttonId?: string | null;
}): Promise<boolean> {
  if (!kindsForButton(params.text).length && !kindsForButton(params.buttonId).length) return false;

  let original: { id: string; key: string | null } | undefined;
  if (params.contextId) {
    [original] = await db
      .select({ id: communicationMessage.id, key: communicationMessage.idempotencyKey })
      .from(communicationMessage)
      .where(and(eq(communicationMessage.providerMessageId, params.contextId), like(communicationMessage.idempotencyKey, "checkin:%")))
      .limit(1);
  }
  if (!original) {
    const recent = await db
      .select({ id: communicationMessage.id, key: communicationMessage.idempotencyKey })
      .from(communicationMessage)
      .where(
        and(
          eq(communicationMessage.contactId, params.contactId),
          like(communicationMessage.idempotencyKey, "checkin:%"),
          gte(communicationMessage.createdAt, new Date(Date.now() - 2 * 86_400_000)),
        ),
      )
      .orderBy(desc(communicationMessage.createdAt))
      .limit(10);
    original = recent.find((m) => {
      const parsed = parseCheckinKey(m.key);
      return parsed && (checkinOption(parsed.kind, params.text) || checkinOption(parsed.kind, params.buttonId));
    });
  }

  const parsed = parseCheckinKey(original?.key);
  if (!original || !parsed) return false;
  const option = checkinOption(parsed.kind, params.text) ?? checkinOption(parsed.kind, params.buttonId);
  if (!option) return false;

  await recordCheckin(db, {
    contactId: params.contactId,
    kind: parsed.kind,
    forDate: parsed.forDate,
    response: option.value,
    messageId: original.id,
  });
  console.log(`[checkin] ${params.contactId} ${parsed.kind} "${option.value}" for ${parsed.forDate}`);

  // They just wrote to us, so the 24-hour window is open: a plain thank-you
  // needs no template. A failure here costs the thanks, never the answer.
  await sendTextMessage({
    contactId: params.contactId,
    body: THANKS[parsed.kind][option.score],
    idempotencyKey: `checkin-thanks:${parsed.kind}:${params.contactId}:${parsed.forDate}:${option.value}`,
  }).catch((err) => console.error("[checkin] thank-you failed:", err));
  return true;
}
