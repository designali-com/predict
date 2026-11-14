import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";
import { clinic, clinicalFormSubmission, clinicProfile, contact } from "./schema";
import type * as schema from "./schema";
import { formByKey, missingRequired, type FormDefinition } from "./clinical-forms";
import { derivedFor } from "./form-scoring";
import { markArrived } from "./arrival";
import { applyRegistrationToChart } from "./registration-sync";
import { FRONT_DESK_FORM_KEY } from "./clinical-forms";

type Database = NodePgDatabase<typeof schema>;

/**
 * Saving and submitting the clinic's forms.
 *
 * Two states on purpose. A draft is kept the moment anything is typed, because
 * these are long forms filled at a counter with a queue behind it and losing
 * half of FORM-I to an interruption is how people stop using the screen and go
 * back to paper. Only a submitted form advances the workflow.
 */

export interface FormPayload {
  contactId: string;
  appointmentId?: string | null;
  formKey: string;
  answers: Record<string, unknown>;
  actorId?: string | null;
  /** Filled in at the foot of the form — see the consent block. */
  consent?: {
    text: string;
    given: boolean;
    /** A PNG data URL from the signature pad. */
    signatureDataUrl: string | null;
    signedName: string | null;
    /** The date on the consent, YYYY-MM-DD. Defaults to today on screen. */
    signedOn?: string | null;
  } | null;
}

/**
 * A signature is a few kilobytes of PNG. Anything much larger is not a
 * signature — it is a pasted photograph or a mistake — and the row it lands
 * in is read on every form load.
 */
const MAX_SIGNATURE_BYTES = 512 * 1024;

/** The consent columns, from a payload. Undefined leaves what is stored. */
function consentPatch(payload: FormPayload) {
  const consent = payload.consent;
  if (!consent) return {};

  const signature = consent.signatureDataUrl?.trim() || null;
  if (signature) {
    if (!signature.startsWith("data:image/")) {
      throw new Error("That signature is not an image.");
    }
    if (signature.length > MAX_SIGNATURE_BYTES) {
      throw new Error("That signature is too large to store.");
    }
  }

  return {
    consentText: consent.text?.trim() || null,
    consentGiven: consent.given === true,
    signatureDataUrl: signature,
    signedName: consent.signedName?.trim() || null,
    // Stamped when a signature arrives, cleared when it is wiped — so a row
    // can never claim a time for a signature it does not hold. The date can
    // be set back for a consent taken on paper earlier; the time of day is
    // whenever it was entered, which is the honest thing to record.
    signedAt: signature ? signedInstant(consent.signedOn) : null,
  };
}

/** A YYYY-MM-DD from the consent, at the current time of day. */
function signedInstant(date?: string | null): Date {
  const now = new Date();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return now;

  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(now);
  at.setFullYear(y!, m! - 1, d!);
  return Number.isNaN(at.getTime()) ? now : at;
}

function definitionOrThrow(formKey: string): FormDefinition {
  const form = formByKey(formKey);
  if (!form) throw new Error(`"${formKey}" is not one of the clinic's forms.`);
  return form;
}

/**
 * Keep what has been typed so far.
 *
 * Upsert on (appointment, form): the unique index means a double-submitted page
 * corrects the existing answers rather than creating a second set nothing can
 * choose between.
 */
/** The row this payload would write to, if there is one. */
async function existingSubmission(db: Database, payload: FormPayload) {
  const [row] = await db
    .select()
    .from(clinicalFormSubmission)
    .where(
      and(
        eq(clinicalFormSubmission.formKey, payload.formKey),
        payload.appointmentId
          ? eq(clinicalFormSubmission.appointmentId, payload.appointmentId)
          : eq(clinicalFormSubmission.contactId, payload.contactId),
      ),
    )
    // Without a visit this is the patient's own copy of the form — the most
    // recent one, wherever it was filled, so what they told us once is what
    // comes back (and is corrected) instead of being asked for again.
    .orderBy(desc(clinicalFormSubmission.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function saveForm(db: Database, payload: FormPayload) {
  const form = definitionOrThrow(payload.formKey);
  const existing = await existingSubmission(db, payload);

  if (existing) {
    // A submitted form stays submitted when it is corrected. Reverting it to a
    // draft would silently walk the visit backwards — the doctor would vanish
    // from their own worklist because somebody fixed a spelling.
    const [updated] = await db
      .update(clinicalFormSubmission)
      .set({ answers: payload.answers, ...consentPatch(payload), updatedAt: new Date() })
      .where(eq(clinicalFormSubmission.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(clinicalFormSubmission)
    .values({
      contactId: payload.contactId,
      appointmentId: payload.appointmentId ?? null,
      formKey: payload.formKey,
      // Stamped now so this submission always renders against the form as it
      // was when it was filled in, however the paper is revised later.
      formVersion: form.version,
      answers: payload.answers,
      ...consentPatch(payload),
      status: "draft",
    })
    .returning();

  return created!;
}

/** Save, check what the form marks required, and mark it done. */
export async function submitForm(db: Database, payload: FormPayload) {
  const form = definitionOrThrow(payload.formKey);

  const missing = missingRequired(form, payload.answers);
  if (missing.length) {
    const names = missing.map((f) => f.label).join(", ");
    throw new Error(`Still to fill in: ${names}`);
  }

  // A signature is optional. The form is saved and submitted without one;
  // when a signature is drawn it is stored with the submission. Agreeing to
  // the consent is still required the first time — a later correction does
  // not ask for it again if it was already given.
  const already = await existingSubmission(db, payload);
  const agreedBefore = Boolean(already?.consentGiven);

  if (!agreedBefore && !payload.consent?.given) {
    throw new Error("The patient has to agree to the consent before this is submitted.");
  }

  const saved = await saveForm(db, payload);

  const [updated] = await db
    .update(clinicalFormSubmission)
    .set({
      status: "submitted",
      submittedAt: new Date(),
      submittedByUserId: payload.actorId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(clinicalFormSubmission.id, saved.id))
    .returning();

  // A form filled in with the patient in front of you is proof they turned
  // up. Recorded only if nothing has said so already — see markArrived.
  await markArrived(db, payload.appointmentId);

  // Page 1 of FORM-I is where the clinic learns who this person is. The chart
  // was created at booking from a name and a number, with a stub date of birth
  // and OTHER for gender; this is what replaces them.
  if (payload.formKey === FRONT_DESK_FORM_KEY) {
    await applyRegistrationToChart(db, {
      contactId: payload.contactId,
      answers: payload.answers,
    });
  }

  return updated!;
}

export interface LoadedForm {
  definition: FormDefinition;
  submission: typeof clinicalFormSubmission.$inferSelect | null;
  answers: Record<string, unknown>;
  /** WOMAC percentages, BMI and the ratios — computed, never stored. */
  derived: ReturnType<typeof derivedFor>;
  /** The consent block at the foot of the form. */
  consent: {
    text: string;
    given: boolean;
    signatureDataUrl: string | null;
    signedName: string | null;
    signedAt: Date | null;
  };
}

/**
 * A last-resort consent line.
 *
 * Only reached on a database with no clinic profile row at all. The wording
 * a clinic asks a patient to agree to is that clinic's, and it is meant to be
 * set — this exists so a form is never shown with an empty consent, not as an
 * answer to what the consent should say.
 */
export const FALLBACK_CONSENT_TEXT =
  "I confirm that the information I have given is true and complete to the best of my knowledge, and I consent to the examination, assessment and treatment discussed with me.";

/** Forms about the person, not the visit: a new visit starts from the last answers. */
const CARRY_FORWARD = new Set(["nutrition_consult"]);

export async function loadForm(
  db: Database,
  params: { formKey: string; appointmentId?: string | null; contactId?: string },
): Promise<LoadedForm> {
  const definition = definitionOrThrow(params.formKey);

  const [submission] = await db
    .select()
    .from(clinicalFormSubmission)
    .where(
      and(
        eq(clinicalFormSubmission.formKey, params.formKey),
        params.appointmentId
          ? eq(clinicalFormSubmission.appointmentId, params.appointmentId)
          : eq(clinicalFormSubmission.contactId, params.contactId ?? ""),
      ),
    )
    // Same rule as saving: without a visit, the patient's latest copy.
    .orderBy(desc(clinicalFormSubmission.updatedAt))
    .limit(1);

  // A form that is about the person rather than the visit (the nutrition
  // consult) opens on a new visit already holding what they told us last
  // time — checked and corrected, not asked again from scratch.
  let carried: Record<string, unknown> | null = null;
  if (!submission && params.appointmentId && params.contactId && CARRY_FORWARD.has(params.formKey)) {
    const [previous] = await db
      .select({ answers: clinicalFormSubmission.answers })
      .from(clinicalFormSubmission)
      .where(
        and(
          eq(clinicalFormSubmission.formKey, params.formKey),
          eq(clinicalFormSubmission.contactId, params.contactId),
        ),
      )
      .orderBy(desc(clinicalFormSubmission.updatedAt))
      .limit(1);
    carried = (previous?.answers as Record<string, unknown>) ?? null;
  }

  const answers = (submission?.answers as Record<string, unknown>) ?? carried ?? {};

  // A form already signed keeps the wording it was signed against. An unsigned
  // one takes the clinic's current wording — which is the whole reason the two
  // are separate columns.
  // The patient's own clinic's wording, then the old single profile's.
  const [owner] = params.contactId
    ? await db
        .select({ consentText: clinic.consentText })
        .from(contact)
        .innerJoin(clinic, eq(clinic.id, contact.clinicId))
        .where(eq(contact.id, params.contactId))
        .limit(1)
    : [];
  const [profile] = owner?.consentText ? [owner] : await db.select().from(clinicProfile).limit(1);

  return {
    definition,
    submission: submission ?? null,
    answers,
    derived: derivedFor(params.formKey, answers),
    consent: {
      text:
        submission?.consentText ??
        definition.consentText ??
        profile?.consentText ??
        FALLBACK_CONSENT_TEXT,
      given: submission?.consentGiven ?? false,
      signatureDataUrl: submission?.signatureDataUrl ?? null,
      signedName: submission?.signedName ?? null,
      signedAt: submission?.signedAt ?? null,
    },
  };
}

/** Every form filled at one visit, for a record view. */
export async function formsForVisit(db: Database, appointmentId: string) {
  const rows = await db
    .select()
    .from(clinicalFormSubmission)
    .where(eq(clinicalFormSubmission.appointmentId, appointmentId));

  return rows.map((row) => ({
    ...row,
    derived: derivedFor(row.formKey, (row.answers as Record<string, unknown>) ?? {}),
  }));
}
