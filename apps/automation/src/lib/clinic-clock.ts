// Clinic wall clock. Asia/Kolkata is a fixed +05:30 and does not observe daylight saving.

const OFFSET_MS = 330 * 60 * 1000;

export interface ClockSlot {
  hour: number;
  minute: number;
}

interface Day {
  y: number;
  m: number;
  d: number;
}

function dayOf(at: Date): Day {
  const shifted = new Date(at.getTime() + OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

function addDays(day: Day, days: number): Day {
  const next = new Date(Date.UTC(day.y, day.m - 1, day.d) + days * 86_400_000);
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
}

function atClock(day: Day, hour: number, minute: number): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${day.y}-${pad(day.m)}-${pad(day.d)}T${pad(hour)}:${pad(minute)}:00+05:30`);
}

/**
 * The soonest slot strictly after `now`. A message that just went out at
 * 10:00 waits for the following slot, it does not fire again on the same one.
 */
export function nextClinicSlot(now: Date, slots: ClockSlot[]): Date {
  const usable = slots.filter((s) => Number.isInteger(s.hour) && Number.isInteger(s.minute));
  if (!usable.length) throw new Error("nextClinicSlot needs at least one time");

  const start = dayOf(now);
  for (let i = 0; i < 3; i++) {
    const day = addDays(start, i);
    const upcoming = usable
      .map((slot) => atClock(day, slot.hour, slot.minute))
      .filter((at) => at.getTime() > now.getTime() + 60_000)
      .sort((a, b) => a.getTime() - b.getTime());
    if (upcoming[0]) return upcoming[0];
  }
  throw new Error("no clinic slot in the next two days");
}

export function formatClockSlot(slot: ClockSlot): string {
  const hour12 = slot.hour % 12 || 12;
  const minute = slot.minute === 0 ? "" : `:${String(slot.minute).padStart(2, "0")}`;
  const suffix = slot.hour < 12 ? "am" : "pm";
  return `${hour12}${minute}${suffix}`;
}

export function assertClinicClock(): void {
  const next = (iso: string) =>
    nextClinicSlot(new Date(iso), [
      { hour: 10, minute: 0 },
      { hour: 13, minute: 30 },
      { hour: 18, minute: 0 },
      { hour: 8, minute: 0 },
    ]).toISOString();
  const at = (iso: string) => new Date(iso).toISOString();
  const expect = (label: string, actual: string, wanted: string) => {
    if (actual !== wanted) throw new Error(`${label}: ${actual}, wanted ${wanted}`);
  };
  expect("just after 10", next("2026-10-05T10:00:30+05:30"), at("2026-10-05T13:30:00+05:30"));
  expect("before 10", next("2026-10-05T09:00:00+05:30"), at("2026-10-05T10:00:00+05:30"));
  expect("after evening", next("2026-10-05T18:05:00+05:30"), at("2026-10-06T08:00:00+05:30"));
  expect("before 8", next("2026-10-05T07:30:00+05:30"), at("2026-10-05T08:00:00+05:30"));
  expect("after lunch", next("2026-10-05T13:30:00+05:30"), at("2026-10-05T18:00:00+05:30"));
}
