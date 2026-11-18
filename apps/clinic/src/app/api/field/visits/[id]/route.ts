import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { isAssignedTo, markCollected, markNotCollected, markOnTheWay } from "@workspace/db/lab-orders";
import { requireApiPermission } from "@/src/lib/auth/permissions";
import { describeError } from "@/src/lib/api-error";
import { notifyCollected, notifyOnTheWay } from "@/src/lib/lab/notify";

/**
 * A field technician updates a visit assigned to them — and only that.
 *
 * PATCH { action }
 *   on_the_way
 *   collected      { kitCode }
 *   not_collected  { reason }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiPermission("clinic.field");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await isAssignedTo(db, id, session.user.id))) {
    return NextResponse.json({ error: "This visit is not assigned to you." }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const actor = session.user.id;
  try {
    switch (body?.action) {
      case "on_the_way":
        await markOnTheWay(db, id, actor);
        await notifyOnTheWay(id).catch(() => null);
        break;
      case "collected":
        await markCollected(db, id, { kitCode: String(body.kitCode ?? ""), actorUserId: actor });
        await notifyCollected(id).catch(() => null);
        break;
      case "not_collected":
        await markNotCollected(db, id, { reason: String(body.reason ?? ""), actorUserId: actor });
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not update the visit") }, { status: 400 });
  }
}
