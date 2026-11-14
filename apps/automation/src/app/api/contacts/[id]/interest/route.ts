import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { interestKey } from "@workspace/db/lead-routing";
import { requirePermission } from "@/src/lib/auth/guards";
import { canSeeLead, leadScope } from "@/src/lib/lead-access";

/**
 * Corrects what a lead is about — the caller learns it was the shoulder, not
 * the knee. Later messages that pick templates by interest follow the change.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.leads");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canSeeLead(await leadScope(session.user), id))) {
    return NextResponse.json({ error: "Not your lead" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const raw = typeof body?.interest === "string" ? body.interest : "";
  const interest = raw.trim() ? interestKey(raw) : null;

  await db.update(contact).set({ interest, updatedAt: new Date() }).where(eq(contact.id, id));
  return NextResponse.json({ ok: true, interest });
}
