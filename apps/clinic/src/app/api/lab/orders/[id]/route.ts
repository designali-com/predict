import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { updateBloodTestOrder } from "@workspace/db/blood-test";
import {
  bookCollection,
  getLabOrder,
  markCollected,
  markNotCollected,
  markOnTheWay,
  markSentToLab,
  recordOrderEvent,
  setLabNote,
} from "@workspace/db/lab-orders";
import { requireApiPermission } from "@/src/lib/auth/permissions";
import { describeError } from "@/src/lib/api-error";
import { notifyCollected, notifyCollectionBooked, notifyOnTheWay } from "@/src/lib/lab/notify";

/**
 * One order, as the lab works it.
 *
 * GET    the order: tests, money, reports, patient, hospital, booking, timeline
 * PATCH  { action }
 *   book           { mode: centre|home, at: ISO, address?, technicianUserId? }
 *   on_the_way
 *   collected      { kitCode }
 *   not_collected  { reason }       back to "to book"
 *   sent_to_lab    { lab, expectedOn? }
 *   note           { note }
 *   cancel         { reason }
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiPermission("clinic.lab");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const detail = await getLabOrder(db, (await params).id);
  if (!detail) return NextResponse.json({ error: "No such order." }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiPermission("clinic.lab");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const actor = session.user.id;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string) : "");

  try {
    switch (body?.action) {
      case "book":
        await bookCollection(db, id, {
          mode: body.mode === "home" ? "home" : "centre",
          at: new Date(text("at")),
          address: text("address") || null,
          technicianUserId: text("technicianUserId") || null,
          actorUserId: actor,
        });
        // The patient hears when and where; a failed message never undoes the booking.
        await notifyCollectionBooked(id).catch(() => null);
        break;
      case "on_the_way":
        await markOnTheWay(db, id, actor);
        await notifyOnTheWay(id).catch(() => null);
        break;
      case "collected":
        await markCollected(db, id, { kitCode: text("kitCode"), actorUserId: actor });
        await notifyCollected(id).catch(() => null);
        break;
      case "not_collected":
        await markNotCollected(db, id, { reason: text("reason"), actorUserId: actor });
        break;
      case "sent_to_lab":
        await markSentToLab(db, id, { lab: text("lab"), expectedOn: text("expectedOn") || null, actorUserId: actor });
        break;
      case "note":
        await setLabNote(db, id, text("note") || null);
        break;
      case "cancel":
        await updateBloodTestOrder(db, id, { cancelReason: text("reason") });
        await recordOrderEvent(db, id, "cancelled", actor, text("reason"));
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not update the order") }, { status: 400 });
  }
}
