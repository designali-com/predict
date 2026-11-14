import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { contact, patientRecord } from "./schema";
import type * as schema from "./schema";
import { toStoredPhone } from "./normalize-phone";

type Database = NodePgDatabase<typeof schema>;

/** P000001, P000002, … — the patient id staff and patients both quote. */
/** See registration-sync: the stand-in for a chart nobody has asked yet. */
const UNKNOWN_GENDER = "UNKNOWN";

export function formatPatientCode(sequenceNo: number): string {
  return `P${String(sequenceNo).padStart(6, "0")}`;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  // One word is a first name only. Copying it into the last name as well is
  // how charts came to read "Mrigendra Mrigendra".
  if (spaceIndex === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
}

export interface RegisterWalkInParams {
  /** The clinic they walked into. */
  clinicId?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  dateOfBirth: string;
  gender: string;
  bloodGroup?: string | null;
}

/**
 * The number is a patient at another clinic. Registering would attach this
 * chart to them — in that clinic's books, out of this desk's sight — so it is
 * refused instead, and the caller says so (a 409 at the desk).
 */
export class PatientAtAnotherClinicError extends Error {
  /** For routes that answer with an error's own status. */
  readonly status = 409;
  constructor() {
    super("This mobile number is a patient at another clinic.");
    this.name = "PatientAtAnotherClinicError";
  }
}

export interface RegisterWalkInResult {
  contactId: string;
  patientId: string;
  patientCode: string;
  /** True when this phone already had a chart — same patient id, new visit. */
  isReturning: boolean;
  /** True when the phone matched a contact that existed as a lead. */
  matchedExistingContact: boolean;
}

/**
 * Register a walk-in and return their patient id, creating one only if this is
 * genuinely a new person.
 *
 * Identity is the mobile number, and that is not a convention — `contact.phone`
 * carries a unique index and `patientRecord.contactId` another, so the chain
 * phone → contact → chart can only ever resolve to one patient id. A returning
 * patient therefore keeps the id they were given the first time; only the
 * appointment is new. Nothing here invents a second record for someone who
 * walks back in six months later with the same number.
 *
 * The lead case matters just as much: a number the clinic already messaged as
 * a lead resolves onto that same contact, so their WhatsApp history, campaign
 * attribution and flow runs stay attached to the person who just walked in.
 *
 * Contact-first, deliberately. The equivalent in apps/web is keyed on userId
 * because it runs after account registration; a walk-in has no login and may
 * never get one, so keying on the account would either block them or create a
 * second chart later.
 *
 * Runs in one transaction: patientCode is assigned from the serial `sequenceNo`
 * that only exists after the insert, and a half-applied write would leave a row
 * stuck at "PENDING" — which, being unique, would then block the next one.
 */
export async function registerWalkIn(
  db: Database,
  params: RegisterWalkInParams,
): Promise<RegisterWalkInResult> {
  const phone = toStoredPhone(params.phone);
  if (!phone) throw new Error("A valid mobile number is required to register a patient");

  const email = params.email?.trim().toLowerCase() || null;
  const now = new Date();

  return db.transaction(async (tx) => {
    let [contactRow] = await tx.select().from(contact).where(eq(contact.phone, phone)).limit(1);
    const matchedExistingContact = Boolean(contactRow);

    // Each clinic keeps its own patients. One already on another clinic's
    // books is not this desk's to register; one on nobody's becomes this
    // clinic's below.
    if (params.clinicId && contactRow?.clinicId && contactRow.clinicId !== params.clinicId) {
      throw new PatientAtAnotherClinicError();
    }

    /**
     * An email that already belongs to somebody else.
     *
     * contact.email is unique, and families share a mailbox constantly — a
     * husband and wife, a parent and child, an attendant who books for both
     * of their parents. The phone number is the identity here, not the email,
     * so the second person is registered without it rather than refused.
     *
     * Matching on the email instead would be worse: it would quietly merge
     * two different people into one chart.
     */
    let usableEmail = email;
    if (email) {
      const [owner] = await tx
        .select({ id: contact.id })
        .from(contact)
        .where(eq(contact.email, email))
        .limit(1);

      if (owner && owner.id !== contactRow?.id) usableEmail = null;
    }

    if (!contactRow) {
      [contactRow] = await tx
        .insert(contact)
        .values({
          name: params.name.trim(),
          phone,
          email: usableEmail,
          // Not PATIENT yet: the appointment being booked is what moves them,
          // and that happens in the caller so a booking failure cannot leave
          // someone marked converted with nothing on the books.
          stage: "LEAD",
          source: "IN_CLINIC",
          clinicId: params.clinicId ?? null,
          firstTouchAt: now,
          lastTouchAt: now,
        })
        .returning();
    } else {
      // Fill blanks only. A walk-in form is a worse source of truth than what
      // the CRM already holds — overwriting a name captured from a lead form
      // with a hurried counter typo is a real way to lose someone.
      [contactRow] = await tx
        .update(contact)
        .set({
          name: contactRow.name ?? params.name.trim(),
          email: contactRow.email ?? usableEmail,
          // Walked in here, so they are this clinic's now — an ad lead or an
          // old row that no clinic had claimed.
          clinicId: contactRow.clinicId ?? params.clinicId ?? null,
          // Walking in is an enquiry; a number we had only broadcast to
          // stops being mere audience here.
          ...(contactRow.stage === "AUDIENCE" ? { stage: "LEAD", leadStatus: "NEW", leadStatusAt: now } : {}),
          lastTouchAt: now,
          updatedAt: now,
        })
        .where(eq(contact.id, contactRow.id))
        .returning();
    }

    const [existingChart] = await tx
      .select()
      .from(patientRecord)
      .where(eq(patientRecord.contactId, contactRow!.id))
      .limit(1);

    if (existingChart) {
      const [updated] = await tx
        .update(patientRecord)
        .set({
          gender: existingChart.gender || params.gender,
          dateOfBirth:
            existingChart.dateOfBirth && existingChart.dateOfBirth !== "1900-01-01"
              ? existingChart.dateOfBirth
              : params.dateOfBirth,
          mobileNumber: existingChart.mobileNumber || phone,
          email: existingChart.email ?? email,
          bloodGroup: existingChart.bloodGroup ?? params.bloodGroup ?? null,
          updatedAt: now,
        })
        .where(eq(patientRecord.id, existingChart.id))
        .returning();

      return {
        contactId: contactRow!.id,
        patientId: updated!.id,
        patientCode: updated!.patientCode,
        isReturning: true,
        matchedExistingContact,
      };
    }

    const { firstName, lastName } = splitName(params.name);

    const [inserted] = await tx
      .insert(patientRecord)
      .values({
        // Replaced below, once the serial has handed out a sequenceNo.
        patientCode: `PENDING-${crypto.randomUUID()}`,
        contactId: contactRow!.id,
        firstName,
        lastName,
        gender: params.gender,
        dateOfBirth: params.dateOfBirth,
        mobileNumber: phone,
        email,
        bloodGroup: params.bloodGroup ?? null,
      })
      .returning();

    const [withCode] = await tx
      .update(patientRecord)
      .set({ patientCode: formatPatientCode(inserted!.sequenceNo), updatedAt: now })
      .where(eq(patientRecord.id, inserted!.id))
      .returning();

    return {
      contactId: contactRow!.id,
      patientId: withCode!.id,
      patientCode: withCode!.patientCode,
      isReturning: false,
      matchedExistingContact,
    };
  });
}

/**
 * What the front desk sees while they are still typing the number — so a
 * returning patient is recognised before a second chart is created rather
 * than after.
 */
export async function lookupByPhone(db: Database, rawPhone: string) {
  const phone = toStoredPhone(rawPhone);
  if (!phone) return null;

  const [row] = await db
    .select({
      contactId: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      stage: contact.stage,
      patientCode: patientRecord.patientCode,
      firstName: patientRecord.firstName,
      lastName: patientRecord.lastName,
      gender: patientRecord.gender,
      dateOfBirth: patientRecord.dateOfBirth,
      bloodGroup: patientRecord.bloodGroup,
    })
    .from(contact)
    .leftJoin(patientRecord, eq(patientRecord.contactId, contact.id))
    .where(eq(contact.phone, phone))
    .limit(1);

  return row ?? null;
}

export interface EnsurePatientRecordResult {
  patientId: string;
  patientCode: string;
  /** True when this call is what created the chart. */
  created: boolean;
}

/**
 * Give this person a patient id, if they do not have one yet.
 *
 * Called when the first appointment is booked. Until then a lead is a name and
 * a phone number; the moment a visit is on the books they are somebody the
 * clinic will be filing notes, reports and therapy days against, and all of
 * that hangs off a chart. Creating it at booking rather than at arrival means
 * the patient id exists before anyone needs to quote it.
 *
 * Deliberately tolerant about what it does not know. A booking often has only
 * a name and a number — gender and date of birth come later, at the counter or
 * from the patient's own profile — so those are stubbed and filled in by the
 * first real edit. Refusing to create the chart without them would mean a
 * booked patient with no id, which is the situation this exists to prevent.
 *
 * Returns the existing chart untouched if there is one. A returning patient
 * keeps the id they were given the first time — see registerWalkIn, which this
 * mirrors.
 */
export async function ensurePatientRecord(
  db: Database,
  contactId: string,
): Promise<EnsurePatientRecordResult | null> {
  const [existing] = await db
    .select({ id: patientRecord.id, patientCode: patientRecord.patientCode })
    .from(patientRecord)
    .where(eq(patientRecord.contactId, contactId))
    .limit(1);

  if (existing) {
    return { patientId: existing.id, patientCode: existing.patientCode, created: false };
  }

  const [contactRow] = await db
    .select()
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  // A chart with no person behind it would be unreachable from every screen.
  if (!contactRow) return null;

  const phone = toStoredPhone(contactRow.phone);
  // mobileNumber is NOT NULL and is how a chart is found from a WhatsApp
  // message. A contact with no number at all cannot have one yet.
  if (!phone) return null;

  const { firstName, lastName } = splitName(contactRow.name?.trim() || "Unknown Patient");

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(patientRecord)
      .values({
        // Replaced below, once the serial has handed out a sequenceNo.
        patientCode: `PENDING-${crypto.randomUUID()}`,
        contactId,
        // Nullable and unique. A walk-in has no login; if they register later,
        // the account links onto this same chart by phone rather than starting
        // a second one.
        userId: contactRow.userId ?? null,
        firstName,
        lastName,
        // Stubs, filled in by the first edit that actually knows. The columns
        // are NOT NULL, and a booking rarely carries either.
        //
        // UNKNOWN, not OTHER. OTHER is a real answer — it is where LGBTQ+ from
        // the registration form lands — so using it as the stand-in made every
        // chart nobody had asked yet read as though somebody had answered.
        gender: UNKNOWN_GENDER,
        dateOfBirth: "1900-01-01",
        mobileNumber: phone,
        email: contactRow.email ?? null,
      })
      .returning();

    const [withCode] = await tx
      .update(patientRecord)
      .set({ patientCode: formatPatientCode(inserted!.sequenceNo), updatedAt: new Date() })
      .where(eq(patientRecord.id, inserted!.id))
      .returning();

    return { patientId: withCode!.id, patientCode: withCode!.patientCode, created: true };
  });
}
