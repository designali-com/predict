// When to send the messages that hang off a booked visit: the day after
// booking, one day in the gap if the visit is far enough, the day before,
// and the morning of the visit. All clocks are the clinic's (IST, +05:30,
// no daylight saving).

const OFFSET_MS = 330 * 60 * 1000;
const SEND_HOUR = 10;
const MORNING_HOUR = 9;
// A worker that wakes a couple of hours late still sends. Later than this,
// the moment has passed — sending "tomorrow" in the evening would stack on
// top of the booking confirmation.
const LATE_GRACE_MS = 3 * 60 * 60 * 1000;

export type VisitWaitMode = "dayAfterBooking" | "between" | "dayBefore" | "morningOf";

export type VisitWaitPlan =
  | { action: "wait"; at: Date }
  | { action: "send" }
  | { action: "skip"; reason: string };

interface Day {
  y: number;
  m: number;
  d: number;
}

function dayOf(at: Date): Day {
  const shifted = new Date(at.getTime() + OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

function dayKey(day: Day): number {
  return day.y * 10000 + day.m * 100 + day.d;
}

function addDays(day: Day, days: number): Day {
  const next = new Date(Date.UTC(day.y, day.m - 1, day.d) + days * 86_400_000);
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
}

function atHour(day: Day, hour: number): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${day.y}-${pad(day.m)}-${pad(day.d)}T${pad(hour)}:00:00+05:30`);
}

function sameDay(a: Date, b: Date): boolean {
  return dayKey(dayOf(a)) === dayKey(dayOf(b));
}

/** The calendar day after the booking, 10:00. Skipped when that day is already the day before the visit or later — the reminder wins that slot. */
function dayAfterBooking(flowStartedAt: Date, scheduledAt: Date): Date | null {
  const target = addDays(dayOf(flowStartedAt), 1);
  const before = addDays(dayOf(scheduledAt), -1);
  if (dayKey(target) >= dayKey(before) || dayKey(target) >= dayKey(dayOf(scheduledAt))) return null;
  return atHour(target, SEND_HOUR);
}

/** 10:00 on a day strictly between the testimonial and the day-before reminder. No such day means the visit is too soon. */
function betweenDay(flowStartedAt: Date, scheduledAt: Date): Date | null {
  const testimonial = dayAfterBooking(flowStartedAt, scheduledAt);
  const after = testimonial ? dayOf(testimonial) : dayOf(flowStartedAt);
  const stop = dayKey(addDays(dayOf(scheduledAt), -1));
  const days: Day[] = [];
  let cursor = addDays(after, 1);
  while (dayKey(cursor) < stop && days.length < 40) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  const mid = days[Math.floor((days.length - 1) / 2)];
  return mid ? atHour(mid, SEND_HOUR) : null;
}

function targetFor(mode: VisitWaitMode, flowStartedAt: Date, scheduledAt: Date): Date | null {
  switch (mode) {
    case "dayAfterBooking":
      return dayAfterBooking(flowStartedAt, scheduledAt);
    case "between":
      return betweenDay(flowStartedAt, scheduledAt);
    case "dayBefore":
      return atHour(addDays(dayOf(scheduledAt), -1), SEND_HOUR);
    case "morningOf":
      return atHour(dayOf(scheduledAt), MORNING_HOUR);
  }
}

export function planVisitWait(input: {
  mode: VisitWaitMode;
  now: Date;
  scheduledAt: Date;
  flowStartedAt: Date;
}): VisitWaitPlan {
  const target = targetFor(input.mode, input.flowStartedAt, input.scheduledAt);
  if (!target) return { action: "skip", reason: "no gap before the visit for this message" };

  if (input.now.getTime() + 5_000 < target.getTime()) return { action: "wait", at: target };
  if (input.now.getTime() >= input.scheduledAt.getTime()) {
    return { action: "skip", reason: "the visit has already started" };
  }
  if (!sameDay(input.now, target)) return { action: "skip", reason: "that day has passed" };
  if (input.now.getTime() - target.getTime() > LATE_GRACE_MS) {
    return { action: "skip", reason: "that send time has passed" };
  }
  return { action: "send" };
}

const ZONE = "Asia/Kolkata";

export function formatVisitDate(at: Date): string {
  return at.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: ZONE });
}

export function formatVisitTime(at: Date): string {
  return at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONE });
}

/** Throws if the timing rules drift. Run before seeding the Ganguly flow. */
export function assertVisitSchedule(): void {
  const book = new Date("2026-10-05T15:00:00+05:30");
  const fri = new Date("2026-10-09T11:00:00+05:30");
  const thu = new Date("2026-10-08T11:00:00+05:30");
  const wed = new Date("2026-10-07T11:00:00+05:30");
  const tue = new Date("2026-10-06T11:00:00+05:30");
  const laterToday = new Date("2026-10-05T18:00:00+05:30");
  const plan = (mode: VisitWaitMode, scheduledAt: Date, now = book) =>
    planVisitWait({ mode, now, scheduledAt, flowStartedAt: book });

  const expect = (label: string, actual: string, wanted: string) => {
    if (actual !== wanted) throw new Error(`${label}: ${actual}, wanted ${wanted}`);
  };

  expect("fri testimonial", plan("dayAfterBooking", fri).action, "wait");
  const between = plan("between", fri);
  expect("fri between", between.action, "wait");
  expect(
    "fri between at",
    between.action === "wait" ? between.at.toISOString() : "",
    new Date("2026-10-07T10:00:00+05:30").toISOString(),
  );
  expect("fri day before", plan("dayBefore", fri).action, "wait");
  expect("fri morning", plan("morningOf", fri).action, "wait");

  expect(
    "send testimonial",
    planVisitWait({
      mode: "dayAfterBooking",
      now: new Date("2026-10-06T10:05:00+05:30"),
      scheduledAt: fri,
      flowStartedAt: book,
    }).action,
    "send",
  );
  expect(
    "late but same morning",
    planVisitWait({
      mode: "dayAfterBooking",
      now: new Date("2026-10-06T12:00:00+05:30"),
      scheduledAt: fri,
      flowStartedAt: book,
    }).action,
    "send",
  );
  expect(
    "missed the day",
    planVisitWait({
      mode: "dayAfterBooking",
      now: new Date("2026-10-07T10:00:00+05:30"),
      scheduledAt: fri,
      flowStartedAt: book,
    }).action,
    "skip",
  );

  expect("thu no between", plan("between", thu).action, "skip");
  expect("wed no testimonial", plan("dayAfterBooking", wed).action, "skip");
  expect("wed no between", plan("between", wed).action, "skip");
  expect("wed day before waits", plan("dayBefore", wed).action, "wait");

  expect("tomorrow booked after 10 skips day-before", plan("dayBefore", tue).action, "skip");
  expect("tomorrow skips testimonial", plan("dayAfterBooking", tue).action, "skip");
  expect("tomorrow morning still waits", plan("morningOf", tue).action, "wait");

  expect("same afternoon skips morning", plan("morningOf", laterToday).action, "skip");
  const early = new Date("2026-10-05T07:00:00+05:30");
  expect(
    "early same day waits for 9",
    planVisitWait({ mode: "morningOf", now: early, scheduledAt: laterToday, flowStartedAt: early }).action,
    "wait",
  );
}
