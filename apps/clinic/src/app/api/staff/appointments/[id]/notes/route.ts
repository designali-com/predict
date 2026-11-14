import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db/client";
import { appointment, appointmentNote } from "@workspace/db/schema";
import { and, eq } from "@workspace/db";
import { appointmentInClinic } from "@workspace/db/appointment-scope";
import { resolveRole } from "@/src/lib/auth/config";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";

const bodySchema = z.object({ content: z.string().trim().min(1) });

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  superadmin: "Super Admin",
  doctor: "Doctor",
  health_coach: "Health Coach",
  nutritionist: "Nutritionist",
};

// Adds a note to an appointment's running log. Snapshots the author's role
// at write time (see schema.ts comment on appointmentNote) rather than
// resolving it live, so the log reads correctly even after a role change.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireClinicApiPermission("clinic.appointments");
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { session } = context;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const appointmentRow = await db.query.appointment.findFirst({
    // Only a visit in the clinic the caller is acting in.
    where: and(eq(appointment.id, id), appointmentInClinic(context.clinic.id)),
  });
  if (!appointmentRow) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const authorRole = resolveRole(session.user.role);

  const [created] = await db
    .insert(appointmentNote)
    .values({
      appointmentId: id,
      authorUserId: session.user.id,
      authorRole,
      content: parsed.data.content,
    })
    .returning();

  if (!created) {
    return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  }

  return NextResponse.json(
    {
      note: {
        id: created.id,
        content: created.content,
        authorName: session.user.name,
        authorRole,
        authorRoleLabel: ROLE_LABELS[authorRole] ?? authorRole,
        createdAt: created.createdAt,
      },
    },
    { status: 201 },
  );
}
