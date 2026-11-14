import { db } from "@workspace/db/client";
import { communicationMessage, contact, task } from "@workspace/db/schema";
import { and, desc, eq, gte } from "@workspace/db";
import { sendReplyButtonsMessage, sendTextMessage } from "@workspace/communication";

const CONCERNS = [
  { label: "Knee pain", interest: "knee_pain" },
  { label: "Back Pain", interest: "back_pain" },
  { label: "Weight Loss", interest: "weight_loss" },
  { label: "Muscle loss", interest: "muscle_loss" },
] as const;

const THANKS = "Thank you. Our health coach will contact you.";
const NOTED = "Noted. Our health coach will contact you.";

const WHO = [
  { id: "concern_who_me", title: "For me" },
  { id: "concern_who_family", title: "Family member" },
] as const;

const DURATION = [
  { id: "concern_dur_month", title: "Under a month" },
  { id: "concern_dur_half", title: "1 to 6 months" },
  { id: "concern_dur_long", title: "Over 6 months" },
] as const;

const WHEN = [
  { id: "concern_time_morning", title: "Morning" },
  { id: "concern_time_afternoon", title: "Afternoon" },
  { id: "concern_time_evening", title: "Evening" },
] as const;

type Step = "who" | "duration" | "time" | "done";

function matchConcern(text: string | null | undefined) {
  const normalized = (text ?? "").trim().toLowerCase();
  return CONCERNS.find((c) => c.label.toLowerCase() === normalized) ?? null;
}

function stepOf(notes: string): Step {
  if (!notes.includes("\nFor:")) return "who";
  if (!notes.includes("\nDuration:")) return "duration";
  if (!notes.includes("\nCall time:")) return "time";
  return "done";
}

function choice(options: readonly { id: string; title: string }[], buttonId: string | null, text: string | null) {
  const byId = options.find((option) => option.id === buttonId);
  if (byId) return byId.title;
  const normalized = (text ?? "").trim().toLowerCase();
  const byTitle = options.find((option) => option.title.toLowerCase() === normalized);
  if (byTitle) return byTitle.title;
  const typed = (text ?? "").trim().slice(0, 200);
  return typed || null;
}

async function alreadySent(key: string) {
  const [prior] = await db
    .select({ id: communicationMessage.id })
    .from(communicationMessage)
    .where(eq(communicationMessage.idempotencyKey, key))
    .limit(1);
  return !!prior;
}

async function openIntake(contactId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: task.id, notes: task.notes })
    .from(task)
    .where(
      and(
        eq(task.contactId, contactId),
        eq(task.assignedRole, "health_coach"),
        eq(task.status, "open"),
        gte(task.createdAt, since),
      ),
    )
    .orderBy(desc(task.createdAt))
    .limit(5);

  return (
    rows.find((row) => {
      const notes = row.notes ?? "";
      return notes.startsWith("They chose") && stepOf(notes) !== "done";
    }) ?? null
  );
}

/**
 * A concern tap opens the 24h window, so the thank-you and the follow-up
 * questions go out as session messages. Nothing here waits on a template.
 * Call Now dials and never arrives here.
 */
export async function acknowledgeConcern(opts: {
  contactId: string;
  clinicId: string | null;
  text: string | null;
  buttonId: string | null;
  inboundMessageId: string;
}): Promise<boolean> {
  const concern = matchConcern(opts.buttonId) ?? matchConcern(opts.text);
  const open = await openIntake(opts.contactId);

  if (open && !concern) return answerIntake(open, opts);
  if (concern) return startIntake(concern, opts);
  return false;
}

async function startIntake(
  concern: (typeof CONCERNS)[number],
  opts: { contactId: string; clinicId: string | null; inboundMessageId: string },
) {
  const thanksKey = `concern_thanks:${opts.inboundMessageId}`;
  const notes = `They chose "${concern.label}" on the welcome message. ref:${opts.inboundMessageId}`;

  if (!(await alreadySent(thanksKey))) {
    const [existingTask] = await db.select({ id: task.id }).from(task).where(eq(task.notes, notes)).limit(1);
    if (!existingTask) {
      await db.insert(task).values({
        contactId: opts.contactId,
        clinicId: opts.clinicId,
        type: "follow_up",
        title: `Health coach: ${concern.label}`,
        notes,
        assignedRole: "health_coach",
        dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      });
    }

    await db.update(contact).set({ interest: concern.interest }).where(eq(contact.id, opts.contactId));
    await sendTextMessage({ contactId: opts.contactId, body: THANKS, idempotencyKey: thanksKey });
  }

  await sendReplyButtonsMessage({
    contactId: opts.contactId,
    bodyText: "Is this for you, or for a family member?",
    buttons: [...WHO],
    idempotencyKey: `concern_q_who:${opts.inboundMessageId}`,
  });
  return true;
}

async function answerIntake(
  open: { id: string; notes: string | null },
  opts: { contactId: string; text: string | null; buttonId: string | null; inboundMessageId: string },
) {
  const notes = open.notes ?? "";
  const step = stepOf(notes);
  if (step === "done") return false;

  const key = `concern_q_${step}:${opts.inboundMessageId}`;
  if (await alreadySent(key)) return true;

  const options = step === "who" ? WHO : step === "duration" ? DURATION : WHEN;
  const picked = choice(options, opts.buttonId, opts.text);
  if (!picked) return false;

  const line = step === "who" ? "For" : step === "duration" ? "Duration" : "Call time";
  await db.update(task).set({ notes: `${notes}\n${line}: ${picked}` }).where(eq(task.id, open.id));

  if (step === "who") {
    await sendReplyButtonsMessage({
      contactId: opts.contactId,
      bodyText: "How long has this been going on?",
      buttons: [...DURATION],
      idempotencyKey: key,
    });
  } else if (step === "duration") {
    await sendReplyButtonsMessage({
      contactId: opts.contactId,
      bodyText: "When should our health coach call you?",
      buttons: [...WHEN],
      idempotencyKey: key,
    });
  } else {
    await sendTextMessage({ contactId: opts.contactId, body: NOTED, idempotencyKey: key });
  }
  return true;
}
