import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { and, asc, eq, ilike, inArray, isNull, or } from "@workspace/db";
import { contact, planEnrollment } from "@workspace/db/schema";
import {
  addDays,
  bookingsOn,
  bookSlot,
  closeDay,
  closedDays,
  reopenDay,
  saveSchedule,
  rescheduleBooking,
  setBookingStatus,
  slotGrid,
  upcomingBookings,
} from "@workspace/db/therapy-calendar";
import { clinicToday } from "@workspace/db/enrollment-service";
import { can } from "@workspace/db/permission-service";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";
import { denyPartner } from "@/src/lib/auth/patient-scope";

/**
 * The therapy calendar — hours, not doctors.
 *
 * GET  ?from=YYYY-MM-DD&days=7   free places per hour, a week at a time
 * GET  ?day=YYYY-MM-DD           who is booked that day, hour by hour
 * GET  ?contactId=…              one patient's coming hours
 * GET  ?q=…                      find a patient to book (name or mobile)
 * POST { action: "book", contactId, day, hour, enrollmentId?, note? }
 * POST { action: "close", day, reason? } | { action: "reopen", day }   (admin)
 * PATCH { bookingId, status: cancelled | no_show | booked }
 *       { action: "reschedule", bookingId, day, hour, therapistId? } — move it
 * PUT  { openHour, lastHour, capacity, closedWeekdays }                 (admin)
 */
const CAN_USE = ["clinic.schedule", "clinic.appointments", "clinic.patients", "clinic.treatment_plans"];

const isDay = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export async function GET(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_USE);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = context.clinic.id;
  const url = new URL(req.url);

  const contactId = url.searchParams.get("contactId");
  if (contactId) return NextResponse.json({ bookings: await upcomingBookings(db, clinicId, contactId) });

  const q = url.searchParams.get("q")?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const people = await db
      .select({ id: contact.id, name: contact.name, phone: contact.phone })
      .from(contact)
      .where(
        and(
          eq(contact.clinicId, clinicId),
          or(ilike(contact.name, `%${q}%`), ...(digits.length >= 4 ? [ilike(contact.phone, `%${digits}%`)] : [])),
        ),
      )
      .orderBy(asc(contact.name))
      .limit(12);
    const courses = people.length
      ? await db
          .select({
            id: planEnrollment.id,
            contactId: planEnrollment.contactId,
            planName: planEnrollment.planName,
            status: planEnrollment.status,
            sittings: planEnrollment.sittings,
          })
          .from(planEnrollment)
          .where(
            and(
              inArray(planEnrollment.contactId, people.map((p) => p.id)),
              inArray(planEnrollment.status, ["active", "prescribed"]),
            ),
          )
      : [];
    return NextResponse.json({
      people: people.map((p) => ({ ...p, courses: courses.filter((c) => c.contactId === p.id) })),
    });
  }

  const day = url.searchParams.get("day");
  if (isDay(day)) {
    return NextResponse.json({ day, bookings: await bookingsOn(db, clinicId, day) });
  }

  const today = clinicToday();
  const fromParam = url.searchParams.get("from");
  const from = isDay(fromParam) ? fromParam : today;
  const days = Math.min(14, Math.max(1, Number(url.searchParams.get("days")) || 7));
  const grid = await slotGrid(db, clinicId, from, days);
  return NextResponse.json({
    from,
    today,
    ...grid,
    holidays: await closedDays(db, clinicId, today, addDays(today, 120)),
    canEdit: await can(db, context.principal, "clinic.settings"),
  });
}

export async function POST(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_USE);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clinicId = context.clinic.id;
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    if (body.action === "close" || body.action === "reopen") {
      if (!(await can(db, context.principal, "clinic.settings"))) {
        return NextResponse.json({ error: "Only an admin closes or opens a day." }, { status: 403 });
      }
      if (body.action === "close") {
        await closeDay(db, clinicId, String(body.day ?? ""), typeof body.reason === "string" ? body.reason : null);
      } else {
        await reopenDay(db, clinicId, String(body.day ?? ""));
      }
      return NextResponse.json({ ok: true });
    }
    // Only a patient on this clinic's books (or an unstamped one from before
    // clinics) can be put in its therapy room. The id comes from the browser.
    const contactId = String(body.contactId ?? "");
    const [patient] = await db
      .select({ id: contact.id })
      .from(contact)
      .where(and(eq(contact.id, contactId), or(eq(contact.clinicId, clinicId), isNull(contact.clinicId))))
      .limit(1);
    if (!patient) return NextResponse.json({ error: "No such patient at this clinic." }, { status: 404 });
    const booking = await bookSlot(db, {
      clinicId,
      contactId,
      day: String(body.day ?? ""),
      hour: Number(body.hour),
      enrollmentId: typeof body.enrollmentId === "string" && body.enrollmentId ? body.enrollmentId : null,
      therapistId: typeof body.therapistId === "string" && body.therapistId ? body.therapistId : null,
      note: typeof body.note === "string" ? body.note : null,
      actorId: context.session.user.id,
    });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not book that hour") }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(CAN_USE);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    if (body.action === "reschedule") {
      const booking = await rescheduleBooking(db, {
        clinicId: context.clinic.id,
        bookingId: String(body.bookingId ?? ""),
        day: String(body.day ?? ""),
        hour: Number(body.hour),
        therapistId: typeof body.therapistId === "string" && body.therapistId ? body.therapistId : null,
        actorId: context.session.user.id,
      });
      return NextResponse.json({ booking });
    }
    const booking = await setBookingStatus(db, context.clinic.id, String(body.bookingId ?? ""), String(body.status ?? ""));
    return NextResponse.json({ booking });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not change that booking") }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(["clinic.settings"]);
  if (!context) return NextResponse.json({ error: "Only an admin changes the therapy hours." }, { status: 403 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    const settings = await saveSchedule(db, context.clinic.id, {
      openHour: Number(body.openHour),
      lastHour: Number(body.lastHour),
      capacity: Number(body.capacity),
      closedWeekdays: Array.isArray(body.closedWeekdays) ? body.closedWeekdays.map(Number) : undefined,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Could not save the hours") }, { status: 400 });
  }
}
