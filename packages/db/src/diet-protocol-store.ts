import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, isNull } from "drizzle-orm";
import { clinic, clinicalFormSubmission, contact, patientRecord } from "./schema";
import type * as schema from "./schema";
import { normalizeProtocol, type DietProtocol } from "./diet-protocol";

type Db = NodePgDatabase<typeof schema>;

/**
 * Where a patient's dietary protocol lives: one clinical_form_submission per
 * patient, with no appointment — the same arrangement as the rules plan
 * (./diet-plan-store.ts). Saving corrects that one row; it is never per visit.
 */
export const PROTOCOL_FORM_KEY = "diet_protocol";

export interface StoredProtocol {
  protocol: DietProtocol;
  updatedAt: string;
}

async function existing(db: Db, contactId: string) {
  const [row] = await db
    .select()
    .from(clinicalFormSubmission)
    .where(
      and(
        eq(clinicalFormSubmission.contactId, contactId),
        eq(clinicalFormSubmission.formKey, PROTOCOL_FORM_KEY),
        isNull(clinicalFormSubmission.appointmentId),
      ),
    )
    .orderBy(desc(clinicalFormSubmission.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function getDietProtocol(db: Db, contactId: string): Promise<StoredProtocol | null> {
  const row = await existing(db, contactId);
  if (!row) return null;
  return { protocol: row.answers as DietProtocol, updatedAt: row.updatedAt.toISOString() };
}

/** Save the nutritionist's protocol. Throws a readable error on bad input. */
export async function saveDietProtocol(
  db: Db,
  contactId: string,
  input: unknown,
  by: { id: string; name: string },
): Promise<StoredProtocol> {
  const now = new Date();
  const protocol: DietProtocol = { ...normalizeProtocol(input), updated: { byName: by.name, at: now.toISOString() } };
  const before = await existing(db, contactId);
  if (before) {
    await db
      .update(clinicalFormSubmission)
      .set({ answers: protocol, formVersion: protocol.version, status: "submitted", submittedAt: now, submittedByUserId: by.id, updatedAt: now })
      .where(eq(clinicalFormSubmission.id, before.id));
  } else {
    await db.insert(clinicalFormSubmission).values({
      contactId,
      appointmentId: null,
      formKey: PROTOCOL_FORM_KEY,
      formVersion: protocol.version,
      answers: protocol,
      status: "submitted",
      submittedAt: now,
      submittedByUserId: by.id,
    });
  }
  return { protocol, updatedAt: now.toISOString() };
}

/** Who and where, for the printed copy's header. */
export interface ProtocolPrint extends StoredProtocol {
  patient: { name: string; code: string | null; gender: string | null; age: number | null; phone: string | null };
  clinic: {
    name: string;
    address: string;
    phone: string | null;
    email: string | null;
    /** The clinic's colour and round mark, so a sheet the patient keeps is in its brand. */
    brandColor: string | null;
    logoUrl: string | null;
  } | null;
}

/**
 * Name parts joined once each: a chart saved with the first name typed again
 * as the last name ("Dheeraj Dheeraj") prints as "Dheeraj".
 */
function cleanName(parts: (string | null | undefined)[]): string {
  const words = parts.flatMap((p) => (p ?? "").trim().split(/\s+/)).filter(Boolean);
  return words.filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1]!.toLowerCase()).join(" ");
}

function ageOn(dob: string | null | undefined, at = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let age = at.getFullYear() - d.getFullYear();
  if (at.getMonth() < d.getMonth() || (at.getMonth() === d.getMonth() && at.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** Who a printed sheet is for, and the clinic it comes from — shared by the diet and exercise prints. */
export interface PrintContext {
  patient: ProtocolPrint["patient"];
  clinic: ProtocolPrint["clinic"];
}

export async function patientPrintContext(db: Db, contactId: string): Promise<PrintContext> {
  const [person] = await db
    .select({ name: contact.name, phone: contact.phone, clinicId: contact.clinicId })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1);
  const [chart] = await db
    .select({
      code: patientRecord.patientCode,
      first: patientRecord.firstName,
      middle: patientRecord.middleName,
      last: patientRecord.lastName,
      gender: patientRecord.gender,
      dob: patientRecord.dateOfBirth,
      phone: patientRecord.mobileNumber,
    })
    .from(patientRecord)
    .where(eq(patientRecord.contactId, contactId))
    .limit(1);
  const [place] = person?.clinicId
    ? await db.select().from(clinic).where(eq(clinic.id, person.clinicId)).limit(1)
    : [];

  const chartName = chart ? cleanName([chart.first, chart.middle, chart.last]) : "";
  return {
    patient: {
      name: chartName || cleanName([person?.name]) || "Patient",
      code: chart?.code ?? null,
      gender: chart?.gender ?? null,
      age: ageOn(chart?.dob),
      phone: chart?.phone ?? person?.phone ?? null,
    },
    clinic: place
      ? {
          name: place.name,
          address: [place.addressLine1, place.addressLine2, [place.city, place.state].filter(Boolean).join(", "), place.pincode]
            .filter(Boolean)
            .join(", "),
          phone: place.phone,
          email: place.email,
          brandColor: place.brandColor,
          logoUrl: place.iconUrl ?? place.logoUrl,
        }
      : null,
  };
}

/** The protocol plus the patient and clinic it is printed for; null when there is none. */
export async function getDietProtocolPrint(db: Db, contactId: string): Promise<ProtocolPrint | null> {
  const stored = await getDietProtocol(db, contactId);
  if (!stored) return null;
  return { ...stored, ...(await patientPrintContext(db, contactId)) };
}
