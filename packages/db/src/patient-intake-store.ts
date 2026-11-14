import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, isNull } from "drizzle-orm";
import { clinicalFormSubmission, contact, patientRecord, task } from "./schema";
import type * as schema from "./schema";
import {
  INTAKE_STEP_COUNT,
  PATIENT_INTAKE_FORM_KEY,
  PATIENT_INTAKE_VERSION,
  PLAN_TURNAROUND_HOURS,
  intakeStepProblem,
  pruneIntakeAnswers,
  type IntakeAnswers,
} from "./patient-intake";

type Db = NodePgDatabase<typeof schema>;

/**
 * Where the patient's questionnaire is kept.
 *
 * One row per patient in clinical_form_submission — no appointment, form key
 * patient_intake. It is saved as a draft on every "Continue", so closing the
 * phone halfway loses nothing and the patient comes back to the step they
 * left; "Submit" marks it done. Answering again later updates the same row
 * rather than piling up versions nobody can choose between.
 */

/** Which step to reopen on. Kept with the answers; nothing else reads it. */
const RESUME_KEY = "_resume_step";
/** "clinic" when the answers were taken at the clinic, asked by staff. */
const SOURCE_KEY = "_filled_by";

export type IntakeSource = "patient" | "clinic";

export interface IntakeRecord {
  id: string;
  status: "draft" | "submitted";
  answers: IntakeAnswers;
  /** 0-based step to reopen a draft on. */
  resumeStep: number;
  /** Who last filled it in: the patient on their dashboard, or staff at the clinic. */
  filledBy: IntakeSource;
  submittedAt: string | null;
  updatedAt: string;
}

function toRecord(row: typeof clinicalFormSubmission.$inferSelect): IntakeRecord {
  const raw = (row.answers ?? {}) as Record<string, unknown>;
  const { [RESUME_KEY]: resume, [SOURCE_KEY]: source, ...answers } = raw;
  const step = Number(resume);
  return {
    id: row.id,
    status: row.status === "submitted" ? "submitted" : "draft",
    answers: answers as IntakeAnswers,
    resumeStep: Number.isInteger(step) && step >= 0 && step < INTAKE_STEP_COUNT ? step : 0,
    filledBy: source === "clinic" ? "clinic" : "patient",
    submittedAt: row.submittedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function existing(db: Db, contactId: string) {
  const [row] = await db
    .select()
    .from(clinicalFormSubmission)
    .where(
      and(
        eq(clinicalFormSubmission.contactId, contactId),
        eq(clinicalFormSubmission.formKey, PATIENT_INTAKE_FORM_KEY),
        isNull(clinicalFormSubmission.appointmentId),
      ),
    )
    .orderBy(desc(clinicalFormSubmission.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function getIntake(db: Db, contactId: string): Promise<IntakeRecord | null> {
  const row = await existing(db, contactId);
  return row ? toRecord(row) : null;
}

export class IntakeValidationError extends Error {}

/**
 * Save progress, or submit.
 *
 * On the first submission a task goes to the clinic's nutritionists, due
 * when the patient was told the plan would be ready. Without it, "a
 * nutritionist reviews the plan before it reaches you" is a sentence on a
 * screen with nobody on the other end of it.
 */
export async function saveIntake(
  db: Db,
  params: {
    contactId: string;
    answers: IntakeAnswers;
    /** 0-based step the patient is now on. */
    step: number;
    submit: boolean;
    actorUserId?: string | null;
    /** Taken at the clinic by staff, rather than filled in by the patient. Default patient. */
    source?: IntakeSource;
  },
): Promise<IntakeRecord> {
  const clean = pruneIntakeAnswers(params.answers);

  if (params.submit) {
    // The basics are what a plan cannot be made without — checked here too,
    // so an answer posted straight to the API cannot skip them.
    const problem = intakeStepProblem(0, clean);
    if (problem) throw new IntakeValidationError(problem);
  }

  const step = Math.max(0, Math.min(INTAKE_STEP_COUNT - 1, Math.trunc(params.step) || 0));
  const source: IntakeSource = params.source ?? "patient";
  const stored = { ...clean, [RESUME_KEY]: step, [SOURCE_KEY]: source };
  const now = new Date();
  const before = await existing(db, params.contactId);

  let row: typeof clinicalFormSubmission.$inferSelect;

  if (before) {
    [row] = await db
      .update(clinicalFormSubmission)
      .set({
        answers: stored,
        formVersion: PATIENT_INTAKE_VERSION,
        // Once submitted it stays submitted: going back to change an answer
        // is an update to a questionnaire already in the nutritionist's hands,
        // not a withdrawal of it.
        ...(params.submit || before.status === "submitted"
          ? { status: "submitted", submittedAt: params.submit ? now : before.submittedAt }
          : {}),
        submittedByUserId: params.submit ? (params.actorUserId ?? null) : before.submittedByUserId,
        updatedAt: now,
      })
      .where(eq(clinicalFormSubmission.id, before.id))
      .returning() as [typeof clinicalFormSubmission.$inferSelect];
  } else {
    [row] = await db
      .insert(clinicalFormSubmission)
      .values({
        contactId: params.contactId,
        appointmentId: null,
        formKey: PATIENT_INTAKE_FORM_KEY,
        formVersion: PATIENT_INTAKE_VERSION,
        answers: stored,
        status: params.submit ? "submitted" : "draft",
        submittedAt: params.submit ? now : null,
        submittedByUserId: params.submit ? (params.actorUserId ?? null) : null,
      })
      .returning() as [typeof clinicalFormSubmission.$inferSelect];
  }

  const firstSubmission = params.submit && before?.status !== "submitted";
  if (firstSubmission) {
    const [person] = await db
      .select({
        contactName: contact.name,
        clinicId: contact.clinicId,
        firstName: patientRecord.firstName,
        lastName: patientRecord.lastName,
        code: patientRecord.patientCode,
      })
      .from(contact)
      .leftJoin(patientRecord, eq(patientRecord.contactId, contact.id))
      .where(eq(contact.id, params.contactId))
      .limit(1);

    // The chart's name, not the contact's: the contact carries whatever an ad
    // form or a WhatsApp profile said first, and on a shared family number
    // that can be somebody else entirely.
    const chartName = [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
    const who = chartName || person?.contactName || "patient";

    await db.insert(task).values({
      contactId: params.contactId,
      clinicId: person?.clinicId ?? null,
      type: "diet_plan",
      title: `Prepare diet plan: ${who}${person?.code ? ` (${person.code})` : ""}`,
      notes:
        (source === "clinic"
          ? `The plan questionnaire was filled in at the clinic — it is on their record, under Plan questionnaire. `
          : `The patient has filled in their plan questionnaire — it is on their record, under Questionnaire. `) +
        `A plan was made from it and their blood report and is already on their dashboard. ` +
        `Review it under Diet plan and change anything that needs it; they were told it would be reviewed within ${PLAN_TURNAROUND_HOURS} hours.`,
      assignedRole: "nutritionist",
      dueAt: new Date(now.getTime() + PLAN_TURNAROUND_HOURS * 3_600_000),
    });
  }

  return toRecord(row);
}
