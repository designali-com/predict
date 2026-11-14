import { db } from "@workspace/db/client";
import { contact, task } from "@workspace/db/schema";
import { and, eq, gt } from "@workspace/db";

/**
 * "Yes, Call Me" — or a plain YES — on a nurture message is someone asking for
 * a call. It goes to the lead's own telecaller as a call due in 15 minutes:
 * the lead is never warmer than the moment they tap it. The AI replier still
 * answers in the chat; this is the human half.
 *
 * One open callback task a day per lead — a second tap does not pile up tasks.
 */

const CALLBACK = /^(yes|yes, call me|call me|call me back|haan|ha|han|hn|ok call|please call)\b/i;
const TITLE = "Tapped “Yes, Call Me” — call within 15 minutes";
const DAY = 86_400_000;

export async function requestCallbackIfAsked(params: { contactId: string; text: string | null; buttonId: string | null }): Promise<boolean> {
  const said = (params.buttonId ?? params.text ?? "").trim();
  if (!CALLBACK.test(said)) return false;

  const [lead] = await db
    .select({ clinicId: contact.clinicId, userId: contact.assignedUserId, role: contact.assignedRole, stage: contact.stage })
    .from(contact)
    .where(eq(contact.id, params.contactId))
    .limit(1);
  // Patients ask the clinic, not the lead desk; only leads get a callback task here.
  if (!lead || lead.stage !== "LEAD") return false;

  const [open] = await db
    .select({ id: task.id })
    .from(task)
    .where(
      and(
        eq(task.contactId, params.contactId),
        eq(task.title, TITLE),
        eq(task.status, "open"),
        gt(task.createdAt, new Date(Date.now() - DAY)),
      ),
    )
    .limit(1);
  if (open) return true;

  await db.insert(task).values({
    contactId: params.contactId,
    clinicId: lead.clinicId,
    type: "call",
    title: TITLE,
    assignedUserId: lead.userId,
    assignedRole: lead.userId ? null : (lead.role ?? null),
    dueAt: new Date(Date.now() + 15 * 60_000),
  });
  return true;
}
