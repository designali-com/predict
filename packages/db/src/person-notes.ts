import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { desc, eq } from "drizzle-orm";
import { contactNote, user } from "./schema";
import type * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export async function listPersonNotes(db: Db, contactId: string) {
  const rows = await db
    .select({
      id: contactNote.id,
      content: contactNote.content,
      authorName: user.name,
      authorRole: contactNote.authorRole,
      createdAt: contactNote.createdAt,
    })
    .from(contactNote)
    .leftJoin(user, eq(contactNote.authorUserId, user.id))
    .where(eq(contactNote.contactId, contactId))
    .orderBy(desc(contactNote.createdAt));

  return rows.map((row) => ({ ...row, authorName: row.authorName ?? "Unknown" }));
}

export async function addPersonNote(
  db: Db,
  input: { contactId: string; authorUserId: string; authorRole: string; content: string },
) {
  const [created] = await db
    .insert(contactNote)
    .values({
      contactId: input.contactId,
      authorUserId: input.authorUserId,
      authorRole: input.authorRole,
      content: input.content,
    })
    .returning({
      id: contactNote.id,
      content: contactNote.content,
      authorRole: contactNote.authorRole,
      createdAt: contactNote.createdAt,
    });
  return created ?? null;
}
