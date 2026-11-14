import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";

/**
 * Resolve whichever id the caller happens to hold to the contact row.
 *
 * This app's patient pages are addressed by user id, because they were built
 * on accounts. Contacts are the row every person has — including the walk-in
 * who has a chart, a patient code and now a course of treatment, but has never
 * logged in and so has no user id at all. A route that only accepted a user id
 * would be unreachable for exactly the patients who are physically in the
 * building.
 */
export async function resolveContactId(params: {
  contactId?: string | null;
  userId?: string | null;
}): Promise<string | null> {
  if (params.contactId) {
    const [row] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(eq(contact.id, params.contactId))
      .limit(1);
    return row?.id ?? null;
  }

  if (params.userId) {
    const [row] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(eq(contact.userId, params.userId))
      .limit(1);
    return row?.id ?? null;
  }

  return null;
}
