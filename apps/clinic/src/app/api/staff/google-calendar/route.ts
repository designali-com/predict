import { NextRequest, NextResponse } from "next/server";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { calendarIsConnected } from "@workspace/communication/visit-meet";

/**
 * Whether this clinician can mint a Meet link. Never returns the token.
 * The desk may ask about the person a visit is booked with; a clinician
 * asking with no userId hears about themselves.
 */
export async function GET(request: NextRequest) {
  const context = await requireClinicApiAnyPermission(["clinic.appointments", "clinic.availability"]);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = request.nextUrl.searchParams.get("userId") || context.session.user.id;
  const connected = await calendarIsConnected(userId);
  return NextResponse.json({ connected });
}
