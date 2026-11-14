// Is the patient in the building?
//
// A separate fact from `status`, and from the visit stage:
//
//   status      did the booking become a visit  — scheduled, confirmed, …
//   arrivedAt   are they physically here        — this file
//   stage       how far through they have got   — ./visit-workflow.ts
//
// Confirmation and arrival do not replace one another. An online booking is
// confirmed days before anybody walks in; a walk-in arrives having confirmed
// nothing. Two independent facts cannot share one enum column.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import { appointment } from "./schema";
import type * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

/**
 * Record that the patient turned up, if nobody has already.
 *
 * Write-once by design. Several things call this — a fee taken, a form
 * submitted, a therapy day checked in — and they all mean the same thing:
 * somebody was standing at the counter. The FIRST of them is when they
 * arrived; a later one is not a second arrival, and letting it overwrite would
 * turn a 40-minute wait into a 2-minute one.
 *
 * Never throws and never blocks its caller. A missing arrival time is worth
 * less than the payment or the form that was being recorded when it failed.
 */
export async function markArrived(
  db: Database,
  appointmentId: string | null | undefined,
  at: Date = new Date(),
): Promise<void> {
  if (!appointmentId) return;

  try {
    await db
      .update(appointment)
      .set({ arrivedAt: at, updatedAt: new Date() })
      .where(and(eq(appointment.id, appointmentId), isNull(appointment.arrivedAt)));
  } catch {
    // Deliberately swallowed — see above.
  }
}

/**
 * Undo it, for the one case that matters: marked by mistake.
 *
 * Not offered as "they left". Leaving is what `status = completed` records,
 * and a clinic that clears arrival on the way out loses every waiting time it
 * ever measured.
 */
export async function clearArrival(db: Database, appointmentId: string): Promise<void> {
  await db
    .update(appointment)
    .set({ arrivedAt: null, updatedAt: new Date() })
    .where(eq(appointment.id, appointmentId));
}

/** Minutes between arriving and now, for a visit still waiting. */
export function waitingMinutes(arrivedAt: Date | string | null, now = new Date()): number | null {
  if (!arrivedAt) return null;
  const at = typeof arrivedAt === "string" ? Date.parse(arrivedAt) : arrivedAt.getTime();
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.round((now.getTime() - at) / 60_000));
}
