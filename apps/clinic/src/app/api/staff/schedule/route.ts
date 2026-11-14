import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { clinicDate, weekBoard } from "@workspace/db/availability-service";
import { sittingsDueOn } from "@workspace/db/enrollment-service";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

/**
 * The week across every clinician, and the therapy due each day.
 *
 * One call rather than three: the board, the day's sittings and the utilisation
 * that falls out of the board are read together on one screen, and splitting
 * them would have the page render three times as each arrived.
 */
export async function GET(req: Request) {
  const context = await requireClinicApiPermission("clinic.schedule");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const requested = url.searchParams.get("from");
  const from = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : clinicDate(0);
  const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days") ?? 7)));

  // Therapy due on the day being looked at. Nobody could answer "who is coming
  // in for therapy today?" before — the log sheet is per patient, so it took
  // opening every course one at a time.
  const therapyDate = url.searchParams.get("therapyDate") ?? clinicDate(0);

  const [board, therapy] = await Promise.all([
    weekBoard(db, { from, days, clinicId: context.clinic.id }),
    sittingsDueOn(db, therapyDate, context.clinic.id),
  ]);

  return NextResponse.json({
    from,
    days,
    dates: board.dates,
    rows: board.rows,
    therapyDate,
    therapy: therapy.map((t) => ({
      sittingId: t.sitting.id,
      contactId: t.sitting.contactId,
      dayNumber: t.sitting.dayNumber,
      mode: t.sitting.mode,
      status: t.sitting.status,
      appointmentId: t.sitting.appointmentId,
      appointmentStatus: t.appointmentStatus,
      patientName: t.contactName,
      phone: t.contactPhone,
      planName: t.enrollment.planName,
      sittings: t.enrollment.sittings,
    })),
  });
}
