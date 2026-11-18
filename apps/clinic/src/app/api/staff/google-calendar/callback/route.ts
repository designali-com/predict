import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { practitionerGoogleCalendar } from "@workspace/db/schema";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { calendarRedirectUri, GOOGLE_CALENDAR_STATE_COOKIE, publicOrigin } from "@/src/lib/google-calendar";

function back(origin: string, calendar: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/availability?calendar=${calendar}`, origin));
  response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

/** Google returns here with a code. The refresh token is stored for this clinician. */
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const context = await requireClinicApiPermission("clinic.availability");
  if (!context) return NextResponse.redirect(new URL("/auth/login", origin));

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get(GOOGLE_CALENDAR_STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) {
    return back(origin, "denied");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return back(origin, "not_configured");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: calendarRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  const json = (await tokenRes.json().catch(() => null)) as { refresh_token?: string } | null;
  if (!tokenRes.ok || !json?.refresh_token) {
    return back(origin, "no_token");
  }

  await db
    .insert(practitionerGoogleCalendar)
    .values({
      userId: context.session.user.id,
      refreshToken: json.refresh_token,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: practitionerGoogleCalendar.userId,
      set: { refreshToken: json.refresh_token, updatedAt: new Date() },
    });

  return back(origin, "connected");
}
