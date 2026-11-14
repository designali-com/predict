import { isPublicPath } from "@/src/lib/auth/public-paths";
import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ai-status: read by the clinic app's server, which has no session here.
  if (pathname === "/api/public/waitlist" || pathname === "/api/public/ai-status") {
    return NextResponse.next();
  }

  // The session, as a cookie (browsers, and apps that keep a cookie jar) or as
  // a bearer token (apps that keep the token). Either is only a hint here — the
  // route itself validates it against the database.
  const sessionCookie =
    getSessionCookie(request) ?? (/^Bearer\s+\S+/i.test(request.headers.get("authorization") ?? "") ? "bearer" : null);

  // Note: whether an already-logged-in user gets bounced away from /auth/*
  // is decided by the login page itself via a real (DB-validated) session
  // check, not here. getSessionCookie() only checks that a cookie is
  // present, not that it's still valid — redirecting on that alone caused
  // an infinite redirect loop for stale/revoked cookies (proxy sends
  // /auth/login -> /dashboard, the dashboard layout's real check sends it
  // back to /auth/login, forever).

  // Allow public paths without authentication
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Protect remaining paths
  if (!sessionCookie) {
    // An API caller — the mobile apps, or a page's fetch — needs to be told
    // it is signed out, not handed the login page's HTML.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized", code: "NOT_AUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.redirect(
      new URL("/auth/login", request.url)
    );  
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};