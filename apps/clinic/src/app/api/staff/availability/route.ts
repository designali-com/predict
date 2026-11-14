import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  addTimeOff,
  listTimeOff,
  removeTimeOff,
  saveWeeklyPattern,
  weeklyPattern,
} from "@workspace/db/availability-service";
import { clinicMember } from "@workspace/db/schema";
import { and, eq } from "@workspace/db";
import { requireClinicApiAnyPermission, requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";

/**
 * A clinician's working hours and leave.
 *
 * Whose calendar this is comes from the session, not from the request — a
 * doctor edits their own. Someone holding Team may edit anybody's, which is
 * what a front desk needs when a doctor phones in sick, and is the only reason
 * ?doctorUserId exists.
 *
 * Everything here is the active clinic's: its rota, its leave. A manager may
 * reach only a clinician who works at this clinic — holding Team here is not
 * a key to another clinic's doctor's diary.
 */
async function resolveTarget(req: Request) {
  const requested = new URL(req.url).searchParams.get("doctorUserId");

  const own = await requireClinicApiPermission("clinic.availability");
  if (own && (!requested || requested === own.session.user.id)) {
    return {
      session: own.session,
      clinicId: own.clinic.id,
      doctorUserId: own.session.user.id,
      onBehalf: false,
    };
  }

  const manager = await requireClinicApiAnyPermission(["clinic.team", "clinic.appointments"]);
  if (manager && requested && (await worksHere(manager.clinic.id, requested))) {
    return { session: manager.session, clinicId: manager.clinic.id, doctorUserId: requested, onBehalf: true };
  }

  return null;
}

async function worksHere(clinicId: string, userId: string): Promise<boolean> {
  const row = await db.query.clinicMember.findFirst({
    where: and(
      eq(clinicMember.clinicId, clinicId),
      eq(clinicMember.userId, userId),
      eq(clinicMember.isActive, true),
    ),
  });
  return Boolean(row);
}

export async function GET(req: Request) {
  const target = await resolveTarget(req);
  if (!target) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    doctorUserId: target.doctorUserId,
    onBehalf: target.onBehalf,
    windows: await weeklyPattern(db, target.doctorUserId, target.clinicId),
    timeOff: await listTimeOff(db, target.doctorUserId, target.clinicId),
  });
}

/** Replaces the whole weekly grid — see saveWeeklyPattern for why wholesale. */
export async function PUT(req: Request) {
  const target = await resolveTarget(req);
  if (!target) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.windows) ? body.windows : [];

  try {
    await saveWeeklyPattern(
      db,
      target.doctorUserId,
      rows.map((w: Record<string, unknown>) => ({
        dayOfWeek: Number(w.dayOfWeek),
        startTime: String(w.startTime ?? ""),
        endTime: String(w.endTime ?? ""),
        slotMinutes: Number(w.slotMinutes ?? 30),
        capacity: Number(w.capacity ?? 1),
        isActive: w.isActive !== false,
      })),
      target.clinicId,
    );
    return NextResponse.json({ windows: await weeklyPattern(db, target.doctorUserId, target.clinicId) });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not save these hours") },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  const target = await resolveTarget(req);
  if (!target) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);

  try {
    // Returns any visits already booked inside the absence. They are not
    // cancelled here — moving a patient is a phone call, not a side effect of
    // ticking a day off — but the screen has to say they are there.
    const result = await addTimeOff(db, target.doctorUserId, target.clinicId, {
      startDate: String(body?.startDate ?? ""),
      endDate: String(body?.endDate ?? body?.startDate ?? ""),
      startTime: body?.startTime ?? null,
      endTime: body?.endTime ?? null,
      reason: body?.reason ?? null,
      actorId: target.session.user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not save that absence") },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const target = await resolveTarget(req);
  if (!target) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await removeTimeOff(db, id, target.doctorUserId, target.clinicId);
  return NextResponse.json({ ok: true });
}
