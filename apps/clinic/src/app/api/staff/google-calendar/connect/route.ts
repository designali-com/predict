import { NextRequest, NextResponse } from "next/server";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { calendarRedirectUri, GOOGLE_CALENDAR_STATE_COOKIE, publicOrigin } from "@/src/lib/google-calendar";

/** The signed-in doctor or nutritionist grants Calendar once, for their own visits. */
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const context = await requireClinicApiPermission("clinic.availability");
  if (!context) {
    return NextResponse.redirect(new URL("/auth/login", origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/availability?calendar=not_configured", origin));
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: calendarRedirectUri(origin),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
