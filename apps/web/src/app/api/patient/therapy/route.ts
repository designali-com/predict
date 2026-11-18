import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { enrollmentsForContact, isPurchasedCourse, logHomeTherapy, logSitting } from "@workspace/db/enrollment-service";
import { SittingMode } from "@workspace/db/treatment-plan";

/**
 * The patient's own view of their course, and the log sheet they fill in.
 *
 * The whole reason this exists: a 6-, 21- or 42-day course does not all happen
 * at the clinic. The patient takes the medicine home and does the therapy
 * themselves, and unless they write down that they did, nobody — not the
 * therapist, not the coach, not the next review — can tell a course that
 * worked from one that was never done.
 *
 * Read by contact, not by patient_record: an offline patient registered at the
 * counter has a course from their first day and a login only later, and their
 * treatment must be visible the moment they sign in rather than starting blank.
 */
async function contactForSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const [row] = await db
    .select({ id: contact.id })
    .from(contact)
    .where(eq(contact.userId, session.user.id))
    .limit(1);

  return { session, contactId: row?.id ?? null };
}

export async function GET() {
  const resolved = await contactForSession();
  if (!resolved) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // No contact row yet is not an error — they simply have no treatment on
  // record, and an empty page says that better than a failure does.
  if (!resolved.contactId) return NextResponse.json({ courses: [] });

  // Only courses the patient bought. A plan the doctor prescribed but that is
  // not yet paid and started is a recommendation, not their therapy.
  const courses = (await enrollmentsForContact(db, resolved.contactId)).filter((c) =>
    isPurchasedCourse(c.enrollment),
  );
  return NextResponse.json({ courses });
}

/**
 * Ticking one day of the log sheet.
 *
 * Three things are fixed server-side and cannot be sent by the browser: the
 * contact (their own, from the session), the source ("patient", so a self-
 * reported day is never indistinguishable from a therapist's record), and the
 * completion time (the clock, not a claimed one).
 *
 * In-clinic days are refused. Whether somebody turned up is the clinic's
 * observation, not theirs, and letting the patient mark a visit attended would
 * put a number into attendance reporting that nobody witnessed. Home days are
 * theirs to report, which is the entire point of a home log sheet.
 */
export async function PATCH(req: Request) {
  const resolved = await contactForSession();
  if (!resolved) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!resolved.contactId) {
    return NextResponse.json({ error: "No treatment on record" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const sittingId = typeof body?.sittingId === "string" ? body.sittingId : "";
  if (!sittingId) return NextResponse.json({ error: "sittingId is required" }, { status: 400 });

  const courses = (await enrollmentsForContact(db, resolved.contactId)).filter((c) =>
    isPurchasedCourse(c.enrollment),
  );
  const sitting = courses.flatMap((c) => c.sittings).find((s) => s.id === sittingId);
  if (!sitting) return NextResponse.json({ error: "Not your sitting" }, { status: 404 });

  // The clinic's record is final. Once it has recorded a day — this row or
  // any other on the same date — the patient's own entry for that day is locked.
  const clinicHasDay = courses
    .flatMap((c) => c.sittings)
    .some(
      (s) =>
        s.enrollmentId === sitting.enrollmentId &&
        s.plannedDate === sitting.plannedDate &&
        s.loggedSource !== "patient" &&
        s.status !== "pending",
    );
  if (clinicHasDay) {
    return NextResponse.json({ error: "The clinic has recorded this day — its record is final." }, { status: 400 });
  }
  // A home day the clinic recorded is theirs to keep, not the patient's to undo.
  if (sitting.loggedSource && sitting.loggedSource !== "patient" && sitting.status !== "pending") {
    return NextResponse.json({ error: "The clinic recorded this day." }, { status: 400 });
  }

  if (sitting.mode !== SittingMode.AT_HOME) {
    return NextResponse.json(
      { error: "This day is at the clinic — the therapist records it when you come in." },
      { status: 400 },
    );
  }

  try {
    const updated = await logSitting(db, {
      sittingId,
      status: body?.status,
      note: body?.note,
      source: "patient",
      actorId: resolved.session.user.id,
      // Scoped to their own contact as well as the ownership check above, so
      // the write itself cannot reach another patient's row.
      contactId: resolved.contactId,
    });
    return NextResponse.json({ sitting: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save that" },
      { status: 400 },
    );
  }
}

/**
 * Logging a day of therapy at home: POST { enrollmentId, date, status: "done" | "missed" }.
 * The patient's diary — see logHomeTherapy. The contact comes from the session,
 * never the body, so nobody can write on another patient's course.
 */
export async function POST(req: Request) {
  const resolved = await contactForSession();
  if (!resolved) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!resolved.contactId) return NextResponse.json({ error: "No treatment on record" }, { status: 404 });

  const body = await req.json().catch(() => null);
  try {
    const sitting = await logHomeTherapy(db, {
      enrollmentId: typeof body?.enrollmentId === "string" ? body.enrollmentId : "",
      contactId: resolved.contactId,
      date: typeof body?.date === "string" ? body.date : "",
      status: body?.status === "missed" ? "missed" : "done",
      note: typeof body?.note === "string" ? body.note : null,
      actorId: resolved.session.user.id,
    });
    return NextResponse.json({ sitting }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save that" }, { status: 400 });
  }
}
