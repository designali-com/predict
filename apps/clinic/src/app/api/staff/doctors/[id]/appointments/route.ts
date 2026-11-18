import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, contact, user } from "@workspace/db/schema";
import { and, asc, eq, inArray } from "@workspace/db";
import { appointmentInClinic } from "@workspace/db/appointment-scope";
import { resolveRole } from "@/src/lib/auth/config";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

// A doctor's full appointment list — used to render their calendar. This is
// the "availability" we can show today: booked slots are visibly busy,
// everything else is implicitly free. It is not the same as a doctor
// explicitly setting working hours/leave (no such data exists yet).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireClinicApiPermission("clinic.appointments");
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const doctorRow = await db.query.user.findFirst({ where: eq(user.id, id) });
  if (!doctorRow || resolveRole(doctorRow.role) !== "doctor") {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  const rows = await db.query.appointment.findMany({
    // Only what they see at THIS clinic; a doctor working two clinics keeps
    // the other one's patients out of this calendar.
    where: and(eq(appointment.doctorUserId, id), appointmentInClinic(context.clinic.id)),
    orderBy: [asc(appointment.scheduledAt)],
  });

  const contactIds = [...new Set(rows.map((r) => r.contactId))];
  const contacts = contactIds.length
    ? await db.query.contact.findMany({ where: inArray(contact.id, contactIds) })
    : [];
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const patientUserIds = [
    ...new Set(contacts.map((c) => c.userId).filter((v): v is string => Boolean(v))),
  ];
  const patients = patientUserIds.length
    ? await db.query.user.findMany({ where: inArray(user.id, patientUserIds) })
    : [];
  const patientNameByUserId = new Map(patients.map((p) => [p.id, p.name]));

  const appointments = rows.map((r) => {
    const c = contactById.get(r.contactId);
    const patientName = (c?.userId ? patientNameByUserId.get(c.userId) : null) ?? c?.name ?? "Unknown";

    return {
      id: r.id,
      scheduledAt: r.scheduledAt,
      status: r.status,
      type: r.type,
      patientName,
    };
  });

  return NextResponse.json({
    doctor: { id: doctorRow.id, name: doctorRow.name },
    appointments,
  });
}
