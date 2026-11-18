import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact, user } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { emitDomainEvent } from "@workspace/db/emit-domain-event";
import { DomainEventType } from "@workspace/db/domain-events";
import { resolveRole } from "@workspace/db/roles";
import { requirePermission } from "@/src/lib/auth/guards";
import { leadScope } from "@/src/lib/lead-access";

/**
 * Hands a lead to someone else (or back to nobody). Only for people who see
 * all leads — a telecaller passing leads between colleagues would defeat the
 * routing rules.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.leads");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await leadScope(session.user)).all) {
    return NextResponse.json({ error: "Only managers can reassign leads" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" && body.userId ? body.userId : null;

  let target: { id: string; name: string; role: string | null } | undefined;
  if (userId) {
    [target] = await db
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!target) return NextResponse.json({ error: "No such person" }, { status: 400 });
  }

  const [updated] = await db
    .update(contact)
    .set({
      assignedUserId: target?.id ?? null,
      assignedRole: target ? resolveRole(target.role) : null,
      assignedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contact.id, id))
    .returning({ id: contact.id, interest: contact.interest, city: contact.city });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await emitDomainEvent(
    db,
    DomainEventType.LEAD_ASSIGNED,
    {
      contactId: id,
      assignedUserId: target?.id ?? "",
      assignedUserName: target?.name ?? "",
      assignedRole: target ? resolveRole(target.role) : "",
      byUserId: session.user.id,
      manual: true,
      interest: updated.interest ?? "",
      city: updated.city ?? "",
    },
    { contactId: id },
  );

  return NextResponse.json({ ok: true });
}
