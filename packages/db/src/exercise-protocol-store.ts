import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, isNull } from "drizzle-orm";
import { clinicalFormSubmission } from "./schema";
import type * as schema from "./schema";
import { normalizeExerciseProtocol, type ExerciseProtocol } from "./exercise-protocol";
import { patientPrintContext, type PrintContext } from "./diet-protocol-store";

type Db = NodePgDatabase<typeof schema>;

/**
 * Where a patient's exercise prescription lives: one clinical_form_submission
 * per patient, with no appointment — the same arrangement as the diet
 * protocol (./diet-protocol-store.ts). Saving corrects that one row.
 *
 * The row's status is the switch: "draft" until a doctor activates it,
 * "submitted" once it is the patient's. Prescriptions from before activation
 * existed were all saved "submitted", so they stay active.
 */
export const EXERCISE_FORM_KEY = "exercise_protocol";

/** The status of a prescription the patient is on. */
export const EXERCISE_ACTIVE_STATUS = "submitted";

export interface StoredExerciseProtocol {
  protocol: ExerciseProtocol;
  /** Switched on for the patient — check-ins go out. */
  active: boolean;
  updatedAt: string;
  /** When it was first prescribed. */
  createdAt: string;
}

async function existing(db: Db, contactId: string) {
  const [row] = await db
    .select()
    .from(clinicalFormSubmission)
    .where(
      and(
        eq(clinicalFormSubmission.contactId, contactId),
        eq(clinicalFormSubmission.formKey, EXERCISE_FORM_KEY),
        isNull(clinicalFormSubmission.appointmentId),
      ),
    )
    .orderBy(desc(clinicalFormSubmission.updatedAt))
    .limit(1);
  return row ?? null;
}

type Row = NonNullable<Awaited<ReturnType<typeof existing>>>;

const stored = (row: Row): StoredExerciseProtocol => ({
  protocol: row.answers as ExerciseProtocol,
  active: row.status === EXERCISE_ACTIVE_STATUS,
  updatedAt: row.updatedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

export async function getExerciseProtocol(db: Db, contactId: string): Promise<StoredExerciseProtocol | null> {
  const row = await existing(db, contactId);
  return row ? stored(row) : null;
}

/**
 * Save the doctor's prescription. A new one is saved as a draft; editing one
 * keeps whether it is active, who activated it, its check-in and when it was
 * sent — those change only through activateExerciseProtocol,
 * setExerciseCheckIn and markExerciseSent. A new one starts with the check-in
 * off: it is started on its own, once the plan is active.
 * Throws a readable error on bad input.
 */
export async function saveExerciseProtocol(
  db: Db,
  contactId: string,
  input: unknown,
  by: { id: string; name: string },
): Promise<StoredExerciseProtocol> {
  const now = new Date();
  const before = await existing(db, contactId);
  const prev = before?.answers as ExerciseProtocol | undefined;
  const protocol: ExerciseProtocol = {
    ...normalizeExerciseProtocol(input),
    dailyCheckIn: prev ? prev.dailyCheckIn !== false : false,
    ...(prev?.activated ? { activated: prev.activated } : {}),
    ...(prev?.checkInStarted ? { checkInStarted: prev.checkInStarted } : {}),
    ...(prev?.sentOnWhatsApp ? { sentOnWhatsApp: prev.sentOnWhatsApp } : {}),
    updated: { byName: by.name, at: now.toISOString() },
  };
  if (before) {
    const [row] = await db
      .update(clinicalFormSubmission)
      .set({ answers: protocol, formVersion: protocol.version, submittedAt: now, submittedByUserId: by.id, updatedAt: now })
      .where(eq(clinicalFormSubmission.id, before.id))
      .returning();
    return stored(row!);
  }
  const [row] = await db
    .insert(clinicalFormSubmission)
    .values({
      contactId,
      appointmentId: null,
      formKey: EXERCISE_FORM_KEY,
      formVersion: protocol.version,
      answers: protocol,
      status: "draft",
      submittedAt: now,
      submittedByUserId: by.id,
    })
    .returning();
  return stored(row!);
}

/** Switch the saved prescription on for the patient. Throws when there is none. */
export async function activateExerciseProtocol(
  db: Db,
  contactId: string,
  by: { id: string; name: string },
): Promise<StoredExerciseProtocol> {
  const before = await existing(db, contactId);
  if (!before) throw new Error("Prescribe the exercises first.");
  if (before.status === EXERCISE_ACTIVE_STATUS) return stored(before);
  const now = new Date();
  const protocol: ExerciseProtocol = {
    ...(before.answers as ExerciseProtocol),
    activated: { byName: by.name, at: now.toISOString() },
  };
  const [row] = await db
    .update(clinicalFormSubmission)
    .set({ answers: protocol, status: EXERCISE_ACTIVE_STATUS, updatedAt: now })
    .where(eq(clinicalFormSubmission.id, before.id))
    .returning();
  return stored(row!);
}

/**
 * Start or stop the daily WhatsApp check-in. Only on an active prescription;
 * starting stamps the day it counts from. Throws a readable error otherwise.
 */
export async function setExerciseCheckIn(
  db: Db,
  contactId: string,
  on: boolean,
  by: { id: string; name: string },
): Promise<StoredExerciseProtocol> {
  const before = await existing(db, contactId);
  if (!before) throw new Error("Prescribe the exercises first.");
  if (on && before.status !== EXERCISE_ACTIVE_STATUS) throw new Error("Activate the prescription first.");
  const prev = before.answers as ExerciseProtocol;
  const protocol: ExerciseProtocol = {
    ...prev,
    dailyCheckIn: on,
    ...(on && !prev.dailyCheckIn ? { checkInStarted: { byName: by.name, at: new Date().toISOString() } } : {}),
  };
  const [row] = await db
    .update(clinicalFormSubmission)
    .set({ answers: protocol, updatedAt: new Date() })
    .where(eq(clinicalFormSubmission.id, before.id))
    .returning();
  return stored(row!);
}

/** Note that the plan just went to the patient on WhatsApp. */
export async function markExerciseSent(db: Db, contactId: string, by: { name: string }): Promise<StoredExerciseProtocol | null> {
  const before = await existing(db, contactId);
  if (!before) return null;
  const protocol: ExerciseProtocol = {
    ...(before.answers as ExerciseProtocol),
    sentOnWhatsApp: { byName: by.name, at: new Date().toISOString() },
  };
  const [row] = await db
    .update(clinicalFormSubmission)
    .set({ answers: protocol, updatedAt: new Date() })
    .where(eq(clinicalFormSubmission.id, before.id))
    .returning();
  return stored(row!);
}

export type ExerciseProtocolPrint = StoredExerciseProtocol & PrintContext;

export async function getExerciseProtocolPrint(db: Db, contactId: string): Promise<ExerciseProtocolPrint | null> {
  const stored = await getExerciseProtocol(db, contactId);
  if (!stored) return null;
  return { ...stored, ...(await patientPrintContext(db, contactId)) };
}
