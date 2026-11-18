import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { slotsForDay } from "@workspace/db/availability-service";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

/**
 * Open slots for one doctor on one day, from this clinic's own data.
 *
 * This used to ask Cal.com, which answered from a single event type with no
 * hosts and no schedule — so every doctor got Cal.com's default Mon–Fri 9–5,
 * the doctor picker on the booking form changed nothing, and two doctors could
 * be put in the same 10:00. The weekly pattern, leave and existing bookings all
 * live here; see @workspace/db/availability-service.
 *
 * A doctor is required. "Any doctor's availability" is not a thing — it was
 * only ever answerable because the old source had no doctors in it.
 */
export async function GET(request: NextRequest) {
  const context = await requireClinicApiPermission("clinic.appointments");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = request.nextUrl.searchParams.get("date");
  const doctorUserId = request.nextUrl.searchParams.get("doctorUserId");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!doctorUserId) {
    // Not an error state to hide: the form asks for the doctor first, and this
    // is what it shows while nobody is chosen.
    return NextResponse.json({
      date,
      slots: [],
      closedReason: "Choose a doctor to see their open times",
    });
  }

  // The hours this doctor works at THIS clinic, not their other branch's.
  const day = await slotsForDay(db, { doctorUserId, date, clinicId: context.clinic.id });

  return NextResponse.json({
    date: day.date,
    closedReason: day.closedReason,
    // Full slots are kept, marked taken. "No times" and "all taken" are
    // different things to the person at the desk, and only one of them is
    // worth trying another doctor for.
    slots: day.slots.map((s) => ({
      id: s.id,
      label: s.label,
      startIso: s.startIso,
      remaining: s.remaining,
      capacity: s.capacity,
    })),
  });
}
