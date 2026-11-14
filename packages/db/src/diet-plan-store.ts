import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, isNull } from "drizzle-orm";
import { clinicalFormSubmission, contact, patientRecord } from "./schema";
import type * as schema from "./schema";
import { buildPersonalizedPlan, PLAN_VERSION, type MarkerStatus, type PersonalizedPlan } from "./diet-plan";
import { patientDashboard } from "./patient-dashboard";
import { getIntake } from "./patient-intake-store";

type Db = NodePgDatabase<typeof schema>;

/**
 * Where a patient's personalised plan is kept, and when it is remade.
 *
 * Stored on the patient's record beside the questionnaire, in
 * clinical_form_submission under its own form key — one row per patient,
 * overwritten each time it is remade, so there is never a question of which
 * plan is current.
 *
 * The rules write it first; a nutritionist can then change anything in it
 * from the clinic panel. Once they have, the rules stop writing over it: a
 * new report or changed answers only mark it outdated, and the nutritionist
 * decides whether to regenerate. Silently replacing somebody's considered
 * edit because a marker moved would make editing pointless.
 */

export const PLAN_FORM_KEY = "personalized_plan";

export interface StoredPlan {
  plan: PersonalizedPlan;
  updatedAt: string;
}

async function existing(db: Db, contactId: string) {
  const [row] = await db
    .select()
    .from(clinicalFormSubmission)
    .where(
      and(
        eq(clinicalFormSubmission.contactId, contactId),
        eq(clinicalFormSubmission.formKey, PLAN_FORM_KEY),
        isNull(clinicalFormSubmission.appointmentId),
      ),
    )
    .orderBy(desc(clinicalFormSubmission.updatedAt))
    .limit(1);
  return row ?? null;
}

async function write(db: Db, contactId: string, plan: PersonalizedPlan, byUserId: string | null = null): Promise<StoredPlan> {
  const now = new Date();
  const before = await existing(db, contactId);
  if (before) {
    await db
      .update(clinicalFormSubmission)
      .set({
        answers: plan,
        formVersion: plan.version,
        status: "submitted",
        submittedAt: now,
        ...(byUserId ? { submittedByUserId: byUserId } : {}),
        updatedAt: now,
      })
      .where(eq(clinicalFormSubmission.id, before.id));
  } else {
    await db.insert(clinicalFormSubmission).values({
      contactId,
      appointmentId: null,
      formKey: PLAN_FORM_KEY,
      formVersion: plan.version,
      answers: plan,
      status: "submitted",
      submittedAt: now,
      submittedByUserId: byUserId,
    });
  }
  return { plan, updatedAt: now.toISOString() };
}

export async function getPatientPlan(db: Db, contactId: string): Promise<StoredPlan | null> {
  const row = await existing(db, contactId);
  if (!row) return null;
  const plan = row.answers as PersonalizedPlan;
  // A plan made by older rules is remade rather than shown — unless a
  // nutritionist has edited it, in which case it is theirs and stays.
  if (plan?.version !== PLAN_VERSION && !plan?.edited) return null;
  return { plan, updatedAt: row.updatedAt.toISOString() };
}

/** What the rules make of the patient right now, or null with no report. */
async function buildFromRecord(db: Db, contactId: string): Promise<PersonalizedPlan | null> {
  const [who] = await db
    .select({ patientId: patientRecord.id, userId: contact.userId })
    .from(contact)
    .leftJoin(patientRecord, eq(patientRecord.contactId, contact.id))
    .where(eq(contact.id, contactId))
    .limit(1);
  if (!who || (!who.patientId && !who.userId)) return null;

  const report = await patientDashboard(db, who.patientId ? { patientId: who.patientId } : { userId: who.userId });

  const markers: Record<string, MarkerStatus> = {};
  for (const b of report.biomarkers) {
    if (b.status === "Unknown") continue;
    markers[b.shortCode.toLowerCase()] = b.status;
  }
  // A plan from a questionnaire alone would be a generic diet sheet with the
  // patient's name on it.
  if (!Object.keys(markers).length) return null;

  const index = report.indexes[0];
  const domains = (index?.domains ?? []).map((d) => ({
    code: d.shortCode,
    name: d.name,
    markers: [...d.biomarkers.map((b) => b.shortCode.toLowerCase()), ...d.missing.map((m) => m.toLowerCase())],
  }));

  const intake = await getIntake(db, contactId);
  return buildPersonalizedPlan({
    markers,
    domains,
    // A half-filled draft still says veg or non-veg; use what there is.
    answers: intake && Object.keys(intake.answers).length ? intake.answers : null,
  });
}

/**
 * Work the plan out again from the current report and answers, and save it.
 *
 * A plan a nutritionist has edited is left as it is and marked outdated with
 * `reason`, unless `force` — which is the nutritionist choosing to
 * regenerate, and throwing their edit away with their eyes open.
 */
export async function refreshPatientPlan(
  db: Db,
  contactId: string,
  options: { force?: boolean; reason?: string } = {},
): Promise<StoredPlan | null> {
  const current = await getPatientPlan(db, contactId);
  if (current?.plan.edited && !options.force) {
    const outdated = { at: new Date().toISOString(), reason: options.reason ?? "The report or the answers changed." };
    return write(db, contactId, { ...current.plan, outdated });
  }

  const plan = await buildFromRecord(db, contactId);
  if (!plan) return current;
  return write(db, contactId, plan);
}

/** The same, from a chart id — what the clinic's report screens hold. */
export async function refreshPatientPlanForChart(
  db: Db,
  patientId: string,
  options: { force?: boolean; reason?: string } = {},
): Promise<StoredPlan | null> {
  const chart = await db.query.patientRecord.findFirst({
    columns: { contactId: true },
    where: eq(patientRecord.id, patientId),
  });
  return chart?.contactId ? refreshPatientPlan(db, chart.contactId, options) : null;
}

/** What a nutritionist may change. Clusters and the basis are the rules' record of why, and stay. */
export type PlanEdit = Pick<PersonalizedPlan, "diet" | "focus" | "supplements" | "meals" | "drink" | "avoid" | "habits" | "cautions">;

/**
 * Save a nutritionist's version of the plan.
 *
 * Starts from the stored plan (or a fresh one) so the clusters and basis
 * the rules found are kept alongside the edit.
 */
export async function savePlanEdit(
  db: Db,
  contactId: string,
  edit: PlanEdit,
  editor: { userId: string; name: string },
): Promise<StoredPlan> {
  const base = (await getPatientPlan(db, contactId))?.plan ?? (await buildFromRecord(db, contactId));
  const { outdated: _dropped, ...kept } = base ?? {
    version: PLAN_VERSION,
    generatedAt: new Date().toISOString(),
    clusters: [],
    basis: { markersMeasured: 0, markersOut: 0, questionnaire: false },
  } as unknown as PersonalizedPlan;

  // Field by field, so nothing but the editable parts can ride in on `edit`.
  const plan: PersonalizedPlan = {
    ...kept,
    diet: edit.diet,
    focus: edit.focus,
    supplements: edit.supplements,
    meals: edit.meals,
    drink: edit.drink,
    avoid: edit.avoid,
    habits: edit.habits,
    cautions: edit.cautions,
    version: PLAN_VERSION,
    edited: { byUserId: editor.userId, byName: editor.name, at: new Date().toISOString() },
  };
  return write(db, contactId, plan, editor.userId);
}
