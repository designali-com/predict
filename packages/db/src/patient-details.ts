import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, ne } from "drizzle-orm";
import { contact, patientRecord, user } from "./schema";
import type * as schema from "./schema";
import { toStoredPhone } from "./normalize-phone";
import { isPlaceholderEmail } from "./placeholder-email";

type Db = NodePgDatabase<typeof schema>;

const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;

export interface PersonDetailsInput {
  contactId: string;
  name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  /** Applied only when this person has a chart. Empty leaves the stored value. */
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
}

export type PersonDetailsResult = { ok: true } | { ok: false; error: string };

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const space = trimmed.indexOf(" ");
  if (space === -1) return { firstName: trimmed, lastName: trimmed };
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1).trim() || trimmed };
}

/**
 * Correct who this person is, on the contact and on the chart together.
 *
 * The two rows are the same human. Editing only the contact left the chart,
 * and a login, showing the old name and number. The mobile stays the
 * identity: a number already on someone else is refused rather than merged.
 */
export async function updatePersonDetails(db: Db, input: PersonDetailsInput): Promise<PersonDetailsResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A name is required" };

  const phone = toStoredPhone(input.phone);
  if (!phone) return { ok: false, error: "A valid mobile number is required" };

  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That email address is not valid" };
  }

  const gender = input.gender?.trim().toUpperCase() || null;
  if (gender && !GENDERS.includes(gender as (typeof GENDERS)[number])) {
    return { ok: false, error: "Sex must be male, female, or other" };
  }

  const dateOfBirth = input.dateOfBirth?.trim() || null;
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return { ok: false, error: "Date of birth must be yyyy-mm-dd" };
  }
  if (dateOfBirth && dateOfBirth > new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: "Date of birth cannot be in the future" };
  }

  const person = await db.query.contact.findFirst({ where: eq(contact.id, input.contactId) });
  if (!person) return { ok: false, error: "No such person" };

  const chart = await db.query.patientRecord.findFirst({
    where: eq(patientRecord.contactId, person.id),
  });

  const takenContact = await db.query.contact.findFirst({
    columns: { id: true, name: true },
    where: and(eq(contact.phone, phone), ne(contact.id, person.id)),
  });
  if (takenContact) {
    return {
      ok: false,
      error: `That mobile number is already on file${takenContact.name ? ` for ${takenContact.name}` : ""}.`,
    };
  }

  if (email) {
    const takenEmail = await db.query.contact.findFirst({
      columns: { id: true, name: true },
      where: and(eq(contact.email, email), ne(contact.id, person.id)),
    });
    if (takenEmail) {
      return {
        ok: false,
        error: `That email is already on file${takenEmail.name ? ` for ${takenEmail.name}` : ""}.`,
      };
    }
  }

  const userId = chart?.userId ?? person.userId;
  if (userId) {
    const takenLogin = await db.query.user.findFirst({
      columns: { id: true },
      where: and(eq(user.phoneNumber, phone), ne(user.id, userId)),
    });
    if (takenLogin) {
      return { ok: false, error: "That mobile number already signs in to another account." };
    }
    if (email) {
      const takenUserEmail = await db.query.user.findFirst({
        columns: { id: true },
        where: and(eq(user.email, email), ne(user.id, userId)),
      });
      if (takenUserEmail) {
        return { ok: false, error: "That email already signs in to another account." };
      }
    }
  }

  const now = new Date();
  const city = input.city !== undefined ? input.city?.trim() || null : undefined;
  const bloodGroup = input.bloodGroup !== undefined ? input.bloodGroup?.trim() || null : undefined;

  await db.transaction(async (tx) => {
    await tx
      .update(contact)
      .set({
        name,
        phone,
        email,
        ...(city !== undefined ? { city } : {}),
        updatedAt: now,
      })
      .where(eq(contact.id, person.id));

    if (chart) {
      const parts = splitName(name);
      await tx
        .update(patientRecord)
        .set({
          firstName: parts.firstName,
          lastName: parts.lastName,
          mobileNumber: phone,
          email,
          ...(dateOfBirth ? { dateOfBirth } : {}),
          ...(gender ? { gender } : {}),
          ...(bloodGroup !== undefined ? { bloodGroup } : {}),
          updatedAt: now,
        })
        .where(eq(patientRecord.id, chart.id));
    }

    if (userId) {
      const [account] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
      await tx
        .update(user)
        .set({
          name,
          phoneNumber: phone,
          // A placeholder is how a mobile-only login exists. Replacing it with
          // a blank is not possible — the column is required — and wiping a
          // real inbox they already use needs them to type the new one.
          ...(email && (isPlaceholderEmail(account?.email) || account?.email === person.email)
            ? { email }
            : {}),
          updatedAt: now,
        })
        .where(eq(user.id, userId));
    }
  });

  return { ok: true };
}
