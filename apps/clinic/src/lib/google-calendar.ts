export const GOOGLE_CALENDAR_STATE_COOKIE = "google_calendar_oauth";

/**
 * The address the browser is on, not the port Next listens on.
 * Behind nginx, nextUrl.origin is http://127.0.0.1:3002, and Google rejects
 * that as redirect_uri_mismatch against the public https callback.
 */
export function publicOrigin(request: { headers: Headers; nextUrl: { origin: string } }): string {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host"))?.split(",")[0]?.trim();
  if (proto && host) return `${proto}://${host}`;
  const configured = process.env.BETTER_AUTH_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return request.nextUrl.origin;
}

export function calendarRedirectUri(origin: string): string {
  return new URL("/api/staff/google-calendar/callback", origin).toString();
}
