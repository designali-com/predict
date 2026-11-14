import { NextResponse, type NextRequest } from "next/server"

/**
 * lab.predict.fit is this same app answering on another host, showing only
 * the lab — at the root of that host:
 *
 *   lab.predict.fit/              →  app/lab (orders)
 *   lab.predict.fit/orders/<id>   →  app/lab/orders/<id>
 *   lab.predict.fit/schedule      →  app/lab/schedule
 *   lab.predict.fit/referrals     →  app/lab/referrals
 *   lab.predict.fit/field         →  app/field (a field technician's visits)
 *
 * Sign-in and the API pass through. Anything else there — a clinic page, or
 * where a login would normally land — goes to the lab's front page, so the
 * clinic is never reachable on the lab's host. On the clinic's own host
 * nothing changes; /lab is one more section.
 */

/** The lab's host, from NEXT_PUBLIC_LAB_URL (e.g. https://lab.predict.fit, or http://lab.localhost:3002 locally). */
const LAB_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_LAB_URL ? new URL(process.env.NEXT_PUBLIC_LAB_URL).host : null
  } catch {
    return null
  }
})()

/** Served as they are on the lab host. */
const PASSTHROUGH = ["/api/", "/auth", "/no-access", "/field", "/_next/", "/favicon", "/icon"]

/** The lab's own pages, at the root of its host. */
const LAB_PAGES = [/^\/$/, /^\/orders\/[^/]+$/, /^\/schedule$/, /^\/referrals$/]

export function proxy(request: NextRequest) {
  if (!LAB_HOST) return NextResponse.next()
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0]!.trim()
  if (host !== LAB_HOST) return NextResponse.next()

  const { pathname } = request.nextUrl
  if (PASSTHROUGH.some((p) => pathname.startsWith(p))) return NextResponse.next()

  // Old or typed /lab/... links: the same page at its clean address.
  if (pathname === "/lab" || pathname.startsWith("/lab/")) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice(4) || "/"
    return NextResponse.redirect(url)
  }

  if (LAB_PAGES.some((re) => re.test(pathname))) {
    const url = request.nextUrl.clone()
    url.pathname = pathname === "/" ? "/lab" : `/lab${pathname}`
    return NextResponse.rewrite(url)
  }

  const url = request.nextUrl.clone()
  url.pathname = "/"
  url.search = ""
  return NextResponse.redirect(url)
}

export const config = {
  // Pages only — files with an extension (images, fonts) pass untouched.
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/"],
}
