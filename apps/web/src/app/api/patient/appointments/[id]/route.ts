import { withReadableUrls } from "@workspace/storage";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { appointment, contact, report, appointmentNote } from "@workspace/db/schema";
import { eq, asc } from "@workspace/db";

const AUTHOR_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  superadmin: "Super Admin",
  doctor: "Doctor",
  health_coach: "Health Coach",
  nutritionist: "Nutritionist",
};

// GET: a single appointment's full detail (basic info + any uploaded
// reports + staff notes) — only for the patient it belongs to.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const appointmentRow = await db.query.appointment.findFirst({
    where: eq(appointment.id, id),
  });
  if (!appointmentRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contactRow = await db.query.contact.findFirst({
    where: eq(contact.id, appointmentRow.contactId),
  });
  if (!contactRow || contactRow.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [reports, noteRows] = await Promise.all([
    db.query.report.findMany({
      where: eq(report.appointmentId, id),
      orderBy: [asc(report.uploadedAt)],
    }),
    db.query.appointmentNote.findMany({
      where: eq(appointmentNote.appointmentId, id),
      orderBy: [asc(appointmentNote.createdAt)],
    }),
  ]);

  return NextResponse.json({
    appointment: appointmentRow,
    reports: await withReadableUrls(
      reports.map((r) => ({
        id: r.id,
        fileUrl: r.fileUrl,
        fileName: r.fileName,
        reportType: r.reportType,
        uploadedAt: r.uploadedAt,
      })),
    ),
    notes: noteRows.map((n) => ({
      id: n.id,
      content: n.content,
      authorRole: AUTHOR_ROLE_LABELS[n.authorRole] ?? n.authorRole,
      createdAt: n.createdAt,
    })),
  });
}