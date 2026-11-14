/**
 * The doctor's exercise prescription for one patient — the printable sheet
 * handed over after a consult: what to do, how many sets and reps, how often,
 * what to avoid, and whether we check in on WhatsApp each morning.
 *
 * The patient's, not a visit's: one prescription, corrected over time, stored
 * as a clinical_form_submission with no appointment (see
 * ./exercise-protocol-store.ts), exactly like the diet protocol. Library
 * prescriptions (./exercise-protocol-library.ts) are copied onto a patient,
 * never linked. Pure data and helpers — safe in the browser.
 */

import { isValdTestKey } from "./vald-catalog";

export interface ProtocolExercise {
  /** "Straight leg raise" */
  name: string;
  /** "3" */
  sets: string;
  /** "10" or "10 each side" */
  reps: string;
  /** Hold or duration: "5 sec hold", "30 sec", "15 min" */
  hold: string;
  /** "Daily", "Twice a day", "3 times a week" */
  frequency: string;
  /** How to do it, or a caution for this one exercise. */
  notes: string;
  /** A demonstration video (https). */
  videoUrl: string;
  /**
   * Set when this line is a DynaMo test done at the clinic rather than an
   * exercise done at home: the key of the test in ./vald-catalog.ts. The
   * patient's page offers it on the Bluetooth runner; the home check-in
   * ignores it.
   */
  vald?: string;
}

export interface ExerciseProtocol {
  version: 1;
  /** The library prescription this one was copied from, if any. */
  source?: { templateId: string; templateName: string };
  /** "Knee Strengthening Program" */
  title: string;
  /** "Reduce knee pain and strengthen quadriceps" */
  goal: string;
  /** "6 weeks" */
  duration: string;
  /** "Every morning, before breakfast" */
  schedule: string;
  /** Warm-up before the session. */
  warmup: string;
  exercises: ProtocolExercise[];
  /** Things to stop for or avoid — "Stop if pain is more than 5/10". */
  precautions: string[];
  /** General instructions — "Apply ice for 10 min after the session". */
  instructions: string[];
  /** "Review after 2 weeks" */
  followUp: string;
  /**
   * Ask on WhatsApp each morning whether yesterday's exercises were done, and
   * record the answer (see ./checkin.ts).
   */
  dailyCheckIn: boolean;
  /** Who last saved it — stamped by the server. */
  updated?: { byName: string; at: string };
  /**
   * Who switched it on for the patient — stamped by the server. Until then it
   * is a draft (an automatic suggestion, or a doctor's unfinished sheet): no
   * check-ins go out, and the daily check-in counts from this date.
   */
  activated?: { byName: string; at: string };
  /**
   * Who started the daily check-in, and when — a separate step from
   * activating; the check-in counts from this day. Stamped by the server.
   */
  checkInStarted?: { byName: string; at: string };
  /** The last time the plan went to the patient on WhatsApp. Stamped by the server. */
  sentOnWhatsApp?: { byName: string; at: string };
}

export const emptyExercise = (): ProtocolExercise => ({
  name: "",
  sets: "",
  reps: "",
  hold: "",
  frequency: "Daily",
  notes: "",
  videoUrl: "",
});

export function emptyExerciseProtocol(): ExerciseProtocol {
  return {
    version: 1,
    title: "",
    goal: "",
    duration: "",
    schedule: "",
    warmup: "",
    exercises: [emptyExercise()],
    precautions: [],
    instructions: [],
    followUp: "",
    dailyCheckIn: true,
  };
}

const ex = (name: string, sets: string, reps: string, hold: string, notes = "", videoUrl = "", frequency = "Daily"): ProtocolExercise => ({
  name,
  sets,
  reps,
  hold,
  frequency,
  notes,
  videoUrl,
});

/** Physiotherapy demonstrations on YouTube (mostly NUH Singapore), checked to exist. */
const yt = (id: string) => `https://www.youtube.com/watch?v=${id}`;
/** The clinic's own demonstrations, on its Google Drive (shared "Anyone with the link"). */
const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;

/** A starting point for the commonest prescription here: knee pain. */
export function kneeTemplate(): ExerciseProtocol {
  return {
    version: 1,
    title: "Knee Strengthening Program",
    goal: "Reduce knee pain, strengthen the thigh muscles and improve movement",
    duration: "6 weeks",
    schedule: "Once a day, morning or evening",
    warmup: "5 minutes of slow walking or cycling without resistance",
    exercises: [
      ex("Static quadriceps (knee press)", "3", "10", "5 sec hold", "Press the back of the knee down into a rolled towel", drive("1xO_XvuT0lNZ6sZXObST7spzwDFb6HXwW")),
      ex("Straight leg raise", "3", "10 each leg", "3 sec hold", "Keep the knee fully straight, lift to the height of the other knee", drive("1oAI3bH7GX4fQPmCqJYJso09RY7a_djSN")),
      ex("Heel slides", "2", "10", "—", "Slide the heel towards the buttock and back, slowly", yt("EKVZ9TIJc-U")),
      ex("Side-lying hip abduction", "2", "10 each side", "2 sec hold", "", drive("1ykaxeoqiSXCjsGPewJB7yuL55Yl6O5bt")),
      ex("Bridging", "3", "10", "3 sec hold", "", drive("1P2GtZ42yPtq8BIO2NuJ-0Xh21IXQ3iin")),
      ex("Calf raises (holding support)", "2", "15", "—", "", yt("h_jzetxMtvM")),
      ex("Hamstring stretch", "3", "1", "30 sec hold", "Gentle stretch, no bouncing", drive("1kscIOKCnIp-p930CTnkDQBBglGCaiGtQ")),
    ],
    precautions: [
      "Stop if pain goes above 5/10, or lasts more than 2 hours after exercise",
      "No squatting, sitting cross-legged or on the floor",
      "Avoid climbing stairs repeatedly during the first 2 weeks",
    ],
    instructions: [
      "Do the exercises slowly and with control — quality over speed",
      "Apply an ice pack for 10 minutes after the session if the knee feels sore",
      "Breathe normally; do not hold your breath",
    ],
    followUp: "Review after 2 weeks",
    dailyCheckIn: true,
  };
}

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max = 40) =>
  Array.isArray(v) ? v.map((x) => str(x, 300)).filter(Boolean).slice(0, max) : [];

/** Clean what the browser sent. Throws a readable error on input that cannot be saved. */
export function normalizeExerciseProtocol(input: unknown): ExerciseProtocol {
  const p = (input ?? {}) as Record<string, unknown>;
  const title = str(p.title, 200);
  if (!title) throw new Error("Give the prescription a title.");

  const exercises = (Array.isArray(p.exercises) ? p.exercises : [])
    .map((e) => {
      const x = (e ?? {}) as Record<string, unknown>;
      const videoUrl = str(x.videoUrl, 500);
      const vald = isValdTestKey(x.vald) ? x.vald : undefined;
      return {
        name: str(x.name, 200),
        sets: str(x.sets, 40),
        reps: str(x.reps, 60),
        hold: str(x.hold, 60),
        frequency: str(x.frequency, 80),
        notes: str(x.notes, 400),
        videoUrl: /^https:\/\//i.test(videoUrl) ? videoUrl : "",
        ...(vald ? { vald } : {}),
      };
    })
    .filter((e) => e.name)
    .slice(0, 40);
  if (!exercises.length) throw new Error("Add at least one exercise.");

  const source = p.source as { templateId?: unknown; templateName?: unknown } | undefined;
  return {
    version: 1,
    ...(source && typeof source.templateId === "string"
      ? { source: { templateId: source.templateId, templateName: str(source.templateName, 200) } }
      : {}),
    title,
    goal: str(p.goal, 300),
    duration: str(p.duration, 80),
    schedule: str(p.schedule, 200),
    warmup: str(p.warmup, 400),
    exercises,
    precautions: list(p.precautions),
    instructions: list(p.instructions),
    followUp: str(p.followUp, 200),
    dailyCheckIn: p.dailyCheckIn !== false,
  };
}


/**
 * One prescription from several library ones, for a patient with pain in more
 * than one place — knee and back and shoulder. Each area's exercises in turn,
 * an exercise two areas share (bridging, a hamstring stretch) only once; every
 * precaution and instruction, without repeats. The doctor adjusts it before
 * saving, as with any copy from the library.
 */
export function combineProtocols(parts: { id: string; name: string; protocol: ExerciseProtocol }[]): ExerciseProtocol {
  const key = (s: string) => s.trim().toLowerCase();
  const distinct = (values: string[]) => {
    const seen = new Set<string>();
    return values.filter((v) => v.trim() && !seen.has(key(v)) && seen.add(key(v)));
  };
  // "Low Back Pain Program" → "Low Back Pain"; "Shoulder Mobility Program (Frozen Shoulder)" → "Shoulder Mobility".
  const area = (name: string) => name.replace(/\(.*?\)/g, "").replace(/\bprogram(me)?\b/gi, "").replace(/\s+/g, " ").trim();
  // The longest course wins: a 6-week knee plan and a 4-week neck plan run six weeks.
  const weeks = (d: string) => Number(d.match(/(\d+)\s*week/i)?.[1] ?? 0);
  const longest = [...parts].sort((a, b) => weeks(b.protocol.duration) - weeks(a.protocol.duration))[0];

  const seen = new Set<string>();
  const exercises = parts.flatMap((p) =>
    p.protocol.exercises.filter((e) => e.name.trim() && !seen.has(key(e.name)) && seen.add(key(e.name))),
  );

  const names = parts.map((p) => area(p.name));
  return {
    version: 1,
    source: { templateId: `mix:${parts.map((p) => p.id).join(",")}`, templateName: names.join(" + ") },
    title: `${names.join(" + ")} Program`.slice(0, 200),
    goal: distinct(parts.map((p) => p.protocol.goal)).join("; ").slice(0, 300),
    duration: longest?.protocol.duration ?? "",
    schedule: parts.find((p) => p.protocol.schedule.trim())?.protocol.schedule ?? "",
    warmup: distinct(parts.map((p) => p.protocol.warmup)).join(" ").slice(0, 400),
    exercises: exercises.length ? exercises.map((e) => ({ ...e })) : [emptyExercise()],
    precautions: distinct(parts.flatMap((p) => p.protocol.precautions)),
    instructions: distinct(parts.flatMap((p) => p.protocol.instructions)),
    followUp: parts.find((p) => p.protocol.followUp.trim())?.protocol.followUp ?? "",
    dailyCheckIn: parts.some((p) => p.protocol.dailyCheckIn),
  };
}
