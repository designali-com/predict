import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { DEAD_END_STATUSES, TIMED_STATUSES, isLeadStatus, leadStatusEventType, leadStatusMeta } from "@workspace/db/lead-status";
import { requirePermission } from "@/src/lib/auth/guards";
import { canSeeLead, leadScope } from "@/src/lib/lead-access";

/**
 * Sets a lead's call disposition — what the caller learnt on this attempt.
 *
 * Emits LEAD_STATUS_CHANGED and the specific LEAD_STATUS_<X>, so a flow
 * triggered on "No answer" sends the we-tried-to-reach-you message. The note
 * travels on the event, which is what the Journey tab reads, so each attempt
 * leaves a line in the history.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.leads");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canSeeLead(await leadScope(session.user), id))) {
    return NextResponse.json({ error: "Not your lead" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!isLeadStatus(status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  // Booked / confirmed / missed / visited come from the appointment itself.
  if (leadStatusMeta(status)?.auto) {
    return NextResponse.json({ error: "That is set from the appointment, not by hand" }, { status: 400 });
  }
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
  let callbackAt: Date | null = null;
  if (body?.callbackAt) {
    callbackAt = new Date(body.callbackAt);
    if (Number.isNaN(callbackAt.getTime())) return NextResponse.json({ error: "Bad callback time" }, { status: 400 });
  }
  if (status === "CALLBACK_LATER" && !callbackAt) {
    return NextResponse.json({ error: "Pick when to call back" }, { status: 400 });
  }

  const [existing] = await db.select().from(contact).where(eq(contact.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  await db
    .update(contact)
    .set({
      leadStatus: status,
      leadStatusAt: now,
      // A callback time only means something while they are waiting for one.
      // No answer and switched-off may carry a "try again at" too (optional);
      // it then queues and reminds exactly like a callback.
      callbackAt: TIMED_STATUSES.includes(status) ? callbackAt : null,
      // Cleared on every status change. The reminder sweep only acts on rows
      // where this is null, so leaving the old stamp in place meant a lead
      // who asked to be called back a second time was never reminded again.
      callbackRemindedAt: null,
      lastTouchAt: now,
      updatedAt: now,
      // Someone working an unclaimed pool lead takes it.
      ...(existing.assignedUserId ? {} : { assignedUserId: session.user.id, assignedAt: now }),
    })
    .where(eq(contact.id, id));

  const payload = {
    contactId: id,
    from: existing.leadStatus,
    to: status,
    note,
    callbackAt: callbackAt?.toISOString() ?? "",
    byUserId: session.user.id,
    byUserName: session.user.name,
    interest: existing.interest ?? "",
    city: existing.city ?? "",
    name: existing.name ?? "",
  };
  await emitDomainEvent(db, DomainEventType.LEAD_STATUS_CHANGED, payload, { contactId: id });
  // Re-marking the same status (a second "No answer") is a real second
  // attempt and fires again on purpose.
  await emitDomainEvent(db, leadStatusEventType(status), payload, { contactId: id });

  // A dead end ends the lead too. This used to be a second, separate "Not
  // interested" button on the page that set the stage; one choice now does
  // both, so nurture stops reaching someone who said no. "Back in play"
  // (the stage control) still brings them back.
  if (DEAD_END_STATUSES.includes(status) && existing.stage === "LEAD") {
    await db.update(contact).set({ stage: "LOST", updatedAt: now }).where(eq(contact.id, id));
    await emitDomainEvent(
      db,
      DomainEventType.CONTACT_STAGE_CHANGED,
      { contactId: id, stage: "LOST", previousStage: existing.stage, byUserId: session.user.id },
      { contactId: id },
    );
  }

  return NextResponse.json({ ok: true });
}
