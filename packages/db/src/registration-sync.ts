// FORM-I page 1 is where the clinic learns who the patient is. This is what
// carries that onto the chart.
//
// The chart is created at booking time from a phone number and a name, with
// stubs for everything the front desk has not been asked yet — 1900-01-01 for
// the date of birth, OTHER for gender. Nothing filled them in afterwards, so a
// patient who told reception their birthday and ticked "Male" still read as
// "— · other" on every screen that shows a chart.
//
// Copied rather than read through: patient_record is what the patient app, the
// biomarker pages and every clinical screen already query, and pointing all of
// them at a JSONB blob keyed by form version would be a much larger change for
// the same six facts.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { contact, patientAddress, patientRecord } from "./schema";
import type * as schema from "./schema";

type Database = NodePgDatabase<typeof schema>;

/** The stub a chart carries from booking until somebody registers the patient. */
export const STUB_DATE_OF_BIRTH = "1900-01-01";

/**
 * Gender on a chart nobody has asked yet.
 *
 * Its own value rather than OTHER, which is a real answer — it is where LGBTQ+
 * from the registration form lands. Using OTHER as the stand-in made every
 * unasked chart read as though somebody had answered "other", which is both
 * wrong and, for the people it is actually about, worse than wrong.
 */
export const UNKNOWN_GENDER = "UNKNOWN";

/** Nothing recorded — the screen shows a blank rather than a guess. */
export function isGenderKnown(gender: string | null | undefined): boolean {
  return Boolean(gender) && gender !== UNKNOWN_GENDER;
}

/**
 * FORM-I's answer to "Sex", as the chart stores it.
 *
 * The form offers Female / Male / LGBTQ+ and the column holds MALE | FEMALE |
 * OTHER. LGBTQ+ maps to OTHER because that is the only third value the column
 * has — not because they mean the same thing. Anything unrecognised returns
 * null so a typo leaves the existing value alone rather than overwriting a
 * real answer with OTHER.
 */
export function genderFromForm(sex: unknown): "MALE" | "FEMALE" | "OTHER" | null {
  const value = String(sex ?? "").trim().toLowerCase();
  if (value === "male") return "MALE";
  if (value === "female") return "FEMALE";
  if (value === "lgbtq+" || value === "other") return "OTHER";
  return null;
}

function text(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s === "" ? null : s;
}

function isoDate(value: unknown): string | null {
  const s = text(value);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export interface RegistrationSyncResult {
  /** Which chart columns were written. Empty when the form said nothing new. */
  updated: string[];
  addressWritten: boolean;
}

/**
 * Copy what page 1 of FORM-I says onto the patient's chart.
 *
 * Every field is written only when the form actually has an answer, so a
 * half-filled registration cannot blank out something that was already known.
 * The one exception is the date of birth, which also overwrites the booking
 * stub — that is the whole point.
 *
 * Age is deliberately NOT stored. It is arithmetic on the date of birth, and a
 * stored age is wrong from the day after it is written.
 */
export async function applyRegistrationToChart(
  db: Database,
  params: { contactId: string; answers: Record<string, unknown> },
): Promise<RegistrationSyncResult> {
  const { answers } = params;

  const [chart] = await db
    .select()
    .from(patientRecord)
    .where(eq(patientRecord.contactId, params.contactId))
    .limit(1);

  if (!chart) return { updated: [], addressWritten: false };

  const patch: Record<string, unknown> = {};

  const firstName = text(answers.first_name);
  const lastName = text(answers.last_name);
  const gender = genderFromForm(answers.sex);
  const dob = isoDate(answers.dob);
  const phone = text(answers.phone_no);

  if (firstName) patch.firstName = firstName;
  if (lastName) patch.lastName = lastName;
  if (gender) patch.gender = gender;
  if (dob) patch.dateOfBirth = dob;
  if (phone) patch.mobileNumber = phone;

  if (Object.keys(patch).length) {
    patch.updatedAt = new Date();
    await db.update(patientRecord).set(patch).where(eq(patientRecord.id, chart.id));

    // The name on the contact is what every list and search reads. Leaving it
    // as whatever was typed at booking means the chart and the lists disagree
    // about what the patient is called.
    if (firstName || lastName) {
      await db
        .update(contact)
        .set({
          name: [firstName ?? chart.firstName, lastName ?? chart.lastName]
            .filter(Boolean)
            .join(" "),
          updatedAt: new Date(),
        })
        .where(eq(contact.id, params.contactId));
    }
  }

  // The address only goes in when it is complete. line1, city, state and
  // pincode are all NOT NULL, and a half address on a chart is worse than
  // none: it looks answered and cannot be posted to.
  const line1 = text(answers.address_line1);
  const city = text(answers.city);
  const state = text(answers.state);
  const pincode = text(answers.pin_code);

  let addressWritten = false;
  if (line1 && city && state && pincode) {
    const [existing] = await db
      .select()
      .from(patientAddress)
      .where(and(eq(patientAddress.patientId, chart.id), eq(patientAddress.addressType, "home")))
      .limit(1);

    const values = {
      patientId: chart.id,
      addressType: "home",
      line1,
      line2: text(answers.address_line2),
      city,
      state,
      pincode,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(patientAddress).set(values).where(eq(patientAddress.id, existing.id));
    } else {
      await db.insert(patientAddress).values(values);
    }
    addressWritten = true;
  }

  return {
    updated: Object.keys(patch).filter((k) => k !== "updatedAt"),
    addressWritten,
  };
}
