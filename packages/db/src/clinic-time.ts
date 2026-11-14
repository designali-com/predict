/**
 * The clinic runs on India time. A record written up for a clinic day —
 * today, or back-dated from the paper sheet — needs a moment to stamp.
 */

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Today's date at the clinic, YYYY-MM-DD. */
export function clinicDate(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The moment to stamp for something that happened on a clinic day: now, if
 * it is today; midday of that day if it is written up afterwards — the day
 * is what is known, the hour is not.
 */
export function clinicMoment(date: string, now: Date = new Date()): Date {
  return date === clinicDate(now) ? now : new Date(`${date}T12:00:00+05:30`);
}

/**
 * Check a clinic day sent by the desk for something that already happened.
 * Absent means today. Throws a readable error for a malformed or future day.
 */
export function pastClinicDate(value: unknown, now: Date = new Date()): string {
  if (value === undefined || value === null || value === "") return clinicDate(now);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("Pick a valid date.");
  }
  if (value > clinicDate(now)) throw new Error("That date is in the future — pick the day it happened.");
  return value;
}
