import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, clinic, clinicMember, contact, task } from "@workspace/db/schema";
import { and, eq, gt, inArray, ne, sql } from "@workspace/db";
import { isSuperadmin } from "@workspace/db/clinic-service";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

/**
 * What removing someone from this clinic would touch — read before the
 * "Remove member" popup asks for confirmation, so it can say so plainly.
 */
export async function GET(req: Request) {
  const context = await requireClinicApiPermission("clinic.team");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Always the clinic this person is signed in to — never one named in the request.
  const id = context.clinic.id;
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Which person?" }, { status: 400 });

  const count = sql<number>`count(*)::int`;
  const [[leads], [tasks], [appointments], elsewhere] = await Promise.all([
    db
      .select({ n: count })
      .from(contact)
      .where(and(eq(contact.clinicId, id), eq(contact.assignedUserId, userId), inArray(contact.stage, ["LEAD", "BOOKED"]))),
    db
      .select({ n: count })
      .from(task)
      .where(and(eq(task.clinicId, id), eq(task.assignedUserId, userId), eq(task.status, "open"))),
    db
      .select({ n: count })
      .from(appointment)
      .where(
        and(
          eq(appointment.clinicId, id),
          eq(appointment.doctorUserId, userId),
          gt(appointment.scheduledAt, new Date()),
          inArray(appointment.status, ["scheduled", "confirmed"]),
        ),
      ),
    db
      .select({ name: clinic.name })
      .from(clinicMember)
      .innerJoin(clinic, eq(clinic.id, clinicMember.clinicId))
      .where(and(eq(clinicMember.userId, userId), ne(clinicMember.clinicId, id), eq(clinicMember.isActive, true))),
  ]);

  return NextResponse.json({
    openLeads: leads?.n ?? 0,
    openTasks: tasks?.n ?? 0,
    upcomingAppointments: appointments?.n ?? 0,
    otherClinics: elsewhere.map((c) => c.name),
    // Only a superadmin may switch somebody's login off.
    canDisableLogin: isSuperadmin(context.session.user.role) && userId !== context.session.user.id,
  });
}
