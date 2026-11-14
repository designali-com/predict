import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { openDatesInRange } from "@workspace/db/availability-service";
import { bookableDoctors, clinicAddressFor } from "@workspace/db/patient-booking";
import { getOrCreateContactForUser } from "@/src/lib/contact";

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD: the dates in that range with at least one
// open slot, from the doctors' own hours, leave and bookings.
//
// For the booking calendar, which disables every other day: a day a doctor
// has marked off, or one that is fully booked, should not be pickable only to
// say "no times" once picked.
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const valid = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!valid(from) || !valid(to) || from > to) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD, from before to" }, { status: 400 });
  }
  // A calendar shows six weeks at most; anything longer is not a calendar asking.
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 62) {
    return NextResponse.json({ error: "Ask for two months at most" }, { status: 400 });
  }

  try {
    const contact = await getOrCreateContactForUser(session.user.id);
    const doctors = await bookableDoctors(db, contact.clinicId ?? null);
    const [dates, clinicAddress] = await Promise.all([
      openDatesInRange(db, { doctorUserIds: doctors, from, to }),
      // Shown on the confirm step for an in-clinic visit.
      clinicAddressFor(db, contact.clinicId ?? null),
    ]);
    return NextResponse.json({ dates, clinicAddress });
  } catch (error) {
    console.error("[appointments/days] could not work out open days:", error);
    return NextResponse.json({ error: "Unable to load available days." }, { status: 500 });
  }
}
