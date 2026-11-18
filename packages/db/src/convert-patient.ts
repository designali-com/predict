import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, inArray } from "drizzle-orm";
import { contact } from "./schema";
import type * as schema from "./schema";
import { emitDomainEvent } from "./emit-domain-event";
import { DomainEventType } from "./domain-events";

type Database = NodePgDatabase<typeof schema>;

/**
 * Stages that still precede being a patient.
 *
 * The same set a plan payment moves, plus AUDIENCE — a person can be booked
 * in from a number we only ever messaged. PATIENT is left alone: converting
 * someone who already is one must not emit a second stage-change.
 */
const BEFORE_PATIENT = ["AUDIENCE", "LEAD", "BOOKED", "INACTIVE", "LOST"] as const;

/**
 * Make this person a patient because the desk said so.
 *
 * Buying a course already does this, when the advance is paid and the course
 * starts. Some people never buy a course — they come in for medicine — and
 * the desk still needs to move them onto the patient side without inventing
 * a plan they did not take.
 */
export async function convertContactToPatient(db: Database, contactId: string) {
  const [moved] = await db
    .update(contact)
    .set({ stage: "PATIENT", updatedAt: new Date() })
    .where(and(eq(contact.id, contactId), inArray(contact.stage, [...BEFORE_PATIENT])))
    .returning({ id: contact.id, stage: contact.stage });

  if (moved) {
    await emitDomainEvent(
      db,
      DomainEventType.CONTACT_STAGE_CHANGED,
      { contactId, stage: "PATIENT" },
      { contactId },
    );
    return { stage: "PATIENT" as const, changed: true };
  }

  const [row] = await db
    .select({ stage: contact.stage })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);

  if (!row) throw new Error("This person is not on record.");
  return { stage: row.stage, changed: false };
}
