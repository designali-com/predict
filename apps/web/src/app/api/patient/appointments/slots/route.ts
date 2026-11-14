import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { bookableDoctors, openSlotsAnyDoctor } from "@workspace/db/patient-booking";
import { getOrCreateContactForUser } from "@/src/lib/contact";

// GET ?date=YYYY-MM-DD: the times a patient can book that day.
//
// From the doctors' own working hours (set in the clinic panel under My
// Availability), their leave, and what is already booked — the same source the
// clinic desk and the WhatsApp flow use. This used to ask Cal.com, whose
// default Mon–Fri 9–5 ignored all of that: a doctor working Saturdays showed
// no Saturday times at all. An empty list is a normal answer, not an error.
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be a valid YYYY-MM-DD string" }, { status: 400 });
  }

  try {
    const contact = await getOrCreateContactForUser(session.user.id);
    const doctors = await bookableDoctors(db, contact.clinicId ?? null);
    if (!doctors.length) {
      return NextResponse.json({
        slots: [],
        reason: "No doctor has set their consultation hours yet.",
      });
    }
    const slots = await openSlotsAnyDoctor(db, { date, doctorUserIds: doctors, clinicId: contact.clinicId ?? null });
    // Plain instants, as the booking screen has always taken them.
    return NextResponse.json({ slots: slots.map((s) => s.startIso) });
  } catch (error) {
    console.error("[appointments/slots] could not work out open times:", error);
    return NextResponse.json({ error: "Unable to load available times. Please try again." }, { status: 500 });
  }
}
