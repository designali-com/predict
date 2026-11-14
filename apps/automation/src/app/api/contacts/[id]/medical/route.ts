import { withReadableUrls } from "@workspace/storage";
import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  contact,
  patientRecord,
  biomarker,
  biomarkerReading,
  biologicalAgeResult,
  report,
  appointment,
  appointmentNote,
  adherenceLog,
} from "@workspace/db/schema";
import { eq, desc, inArray } from "@workspace/db";
import { requireOperations } from "@/src/lib/auth/guards";

/**
 * The clinical half of the 360 view, assembled for a support agent about to
 * pick up the phone.
 *
 * Note the two different keys. Lifecycle data (appointments, adherence) hangs
 * off contactId, because a walk-in lead has those from day one. Clinical data
 * (readings, biological age, uploaded reports) hangs off userId, because it
 * only exists once the person has an account and a chart. A lead who never
 * registered therefore has a perfectly valid empty clinical section — that is
 * "no account yet", not an error, and hasAccount says which.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [contactRow] = await db.select().from(contact).where(eq(contact.id, id)).limit(1);
  if (!contactRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [chart] = await db
    .select()
    .from(patientRecord)
    .where(eq(patientRecord.contactId, id))
    .limit(1);

  // Appointments and their visit notes, newest first — the agent's first
  // question on a call is almost always "when did they last come in".
  const appointments = await db
    .select()
    .from(appointment)
    .where(eq(appointment.contactId, id))
    .orderBy(desc(appointment.scheduledAt))
    .limit(50);

  const notes = appointments.length
    ? await db
        .select()
        .from(appointmentNote)
        .where(
          inArray(
            appointmentNote.appointmentId,
            appointments.map((a) => a.id),
          ),
        )
        .orderBy(desc(appointmentNote.createdAt))
    : [];

  const adherence = await db
    .select()
    .from(adherenceLog)
    .where(eq(adherenceLog.contactId, id))
    .orderBy(desc(adherenceLog.loggedAt))
    .limit(50);

  const userId = contactRow.userId;
  if (!userId) {
    return NextResponse.json({
      hasAccount: false,
      chart: chart ?? null,
      appointments,
      notes,
      adherence,
      readings: [],
      biologicalAge: [],
      reports: [],
    });
  }

  // Joined to biomarker so the UI has a name and unit to render — a bare
  // value like "5.4" is meaningless to whoever is on the call.
  const readings = await db
    .select({
      id: biomarkerReading.id,
      value: biomarkerReading.value,
      recordedAt: biomarkerReading.recordedAt,
      name: biomarker.name,
      shortCode: biomarker.shortCode,
      unit: biomarker.unit,
      rangeMin: biomarker.rangeMin,
      rangeMax: biomarker.rangeMax,
    })
    .from(biomarkerReading)
    .innerJoin(biomarker, eq(biomarkerReading.biomarkerId, biomarker.id))
    .where(eq(biomarkerReading.userId, userId))
    .orderBy(desc(biomarkerReading.recordedAt))
    .limit(200);

  const biologicalAge = await db
    .select()
    .from(biologicalAgeResult)
    .where(eq(biologicalAgeResult.userId, userId))
    .orderBy(desc(biologicalAgeResult.calculatedAt))
    .limit(10);

  const reports = await db
    .select()
    .from(report)
    .where(eq(report.userId, userId))
    .orderBy(desc(report.uploadedAt))
    .limit(50);

  return NextResponse.json({
    hasAccount: true,
    chart: chart ?? null,
    appointments,
    notes,
    adherence,
    readings,
    biologicalAge,
    // Signed: reports are private in storage.
    reports: await withReadableUrls(reports),
  });
}
