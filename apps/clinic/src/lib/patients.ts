import { db } from "@workspace/db/client";
import { patientRecord, patientAddress, contact } from "@workspace/db/schema";
import { eq, and } from "@workspace/db";

function formatPatientCode(sequenceNo: number): string {
  return `P${String(sequenceNo).padStart(6, "0")}`;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: trimmed };
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
}

export async function getPatientByUserId(userId: string) {
  const [row] = await db.select().from(patientRecord).where(eq(patientRecord.userId, userId)).limit(1);
  return row ?? null;
}

export interface UpsertPatientParams {
  userId: string;
  /** Used only when creating a new record and firstName/lastName aren't given directly. */
  fallbackFullName?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  /** Required to *create* a record; optional on update (falls back to the existing value) — a
   * staff member editing just the mobile number shouldn't need to re-supply gender/DOB too. */
  gender?: string;
  dateOfBirth?: string;
  mobileNumber?: string;
  bloodGroup?: string | null;
  alternateMobile?: string | null;
  email?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  language?: string | null;
}

/**
 * The required fields (gender, dateOfBirth, mobileNumber, name) aren't all
 * known at account-registration time — this row only comes into existence
 * once a patient's (or staff's, via intake) profile actually has them, same
 * upsert-on-save: the row is created the first time it is filled in.
 */
export async function upsertPatient(params: UpsertPatientParams) {
  const existing = await getPatientByUserId(params.userId);
  const now = new Date();

  // Every chart hangs off the contact, not just the login. Deleting a user
  // nulls patientRecord.userId, and without this the chart would be
  // unreachable from the person it belongs to — which is how the orphaned
  // duplicate records in this table came about.
  const [contactRow] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(eq(contact.userId, params.userId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(patientRecord)
      .set({
        firstName: params.firstName ?? existing.firstName,
        middleName: params.middleName ?? existing.middleName,
        lastName: params.lastName ?? existing.lastName,
        gender: params.gender ?? existing.gender,
        dateOfBirth: params.dateOfBirth ?? existing.dateOfBirth,
        mobileNumber: params.mobileNumber ?? existing.mobileNumber,
        bloodGroup: params.bloodGroup ?? existing.bloodGroup,
        alternateMobile: params.alternateMobile ?? existing.alternateMobile,
        email: params.email ?? existing.email,
        maritalStatus: params.maritalStatus ?? existing.maritalStatus,
        nationality: params.nationality ?? existing.nationality,
        language: params.language ?? existing.language,
        // Backfills the link on rows created before contactId existed.
        contactId: existing.contactId ?? contactRow?.id ?? null,
        updatedAt: now,
      })
      .where(eq(patientRecord.id, existing.id))
      .returning();
    return updated!;
  }

  if (!params.gender || !params.dateOfBirth || !params.mobileNumber) {
    throw new Error(
      "gender, dateOfBirth, and mobileNumber are required to create a new patient record",
    );
  }

  const { firstName, lastName } =
    params.firstName && params.lastName
      ? { firstName: params.firstName, lastName: params.lastName }
      : splitName(params.fallbackFullName ?? "Unknown Patient");

  const [inserted] = await db
    .insert(patientRecord)
    .values({
      patientCode: "PENDING", // replaced below once sequenceNo is assigned
      contactId: contactRow?.id ?? null,
      userId: params.userId,
      firstName,
      middleName: params.middleName ?? null,
      lastName,
      gender: params.gender,
      dateOfBirth: params.dateOfBirth,
      mobileNumber: params.mobileNumber,
      bloodGroup: params.bloodGroup ?? null,
      alternateMobile: params.alternateMobile ?? null,
      email: params.email ?? null,
      maritalStatus: params.maritalStatus ?? null,
      nationality: params.nationality ?? null,
      language: params.language ?? null,
    })
    .returning();

  const [withCode] = await db
    .update(patientRecord)
    .set({ patientCode: formatPatientCode(inserted!.sequenceNo) })
    .where(eq(patientRecord.id, inserted!.id))
    .returning();

  return withCode!;
}

export interface UpsertHomeAddressParams {
  patientId: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  country?: string;
  pincode: string;
}

/** Upserts the patient's single "home" address — the table itself supports
 * more (work/other), this just covers the common one-address profile UX. */
export async function upsertHomeAddress(params: UpsertHomeAddressParams) {
  const [existing] = await db
    .select()
    .from(patientAddress)
    .where(and(eq(patientAddress.patientId, params.patientId), eq(patientAddress.addressType, "home")))
    .limit(1);

  const now = new Date();
  const values = {
    line1: params.line1,
    line2: params.line2 ?? null,
    city: params.city,
    state: params.state,
    country: params.country ?? "India",
    pincode: params.pincode,
    updatedAt: now,
  };

  if (existing) {
    const [updated] = await db
      .update(patientAddress)
      .set(values)
      .where(eq(patientAddress.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(patientAddress)
    .values({ patientId: params.patientId, addressType: "home", ...values })
    .returning();
  return created!;
}

export async function getHomeAddress(patientId: string) {
  const [row] = await db
    .select()
    .from(patientAddress)
    .where(and(eq(patientAddress.patientId, patientId), eq(patientAddress.addressType, "home")))
    .limit(1);
  return row ?? null;
}
