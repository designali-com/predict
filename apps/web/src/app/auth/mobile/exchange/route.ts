import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/src/lib/auth/auth";
import { checkBridgeRateLimit, exchangeGrant } from "@/src/lib/auth/mobile-bridge";

/** Better Auth's default session life; the server still decides. */
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;

/** A 43-character code and verifier; 1 KB is plenty, checked before parsing. */
const MAX_EXCHANGE_BODY_BYTES = 1024;

/**
 * Step 4 of the apps' browser sign-in: trade the code from the browser and
 * the verifier the app kept in memory for the session cookie.
 *
 * An unknown, expired or mis-verified code all get the same 401 — which one
 * it was helps nobody but an attacker. The cookie goes back as a Set-Cookie,
 * so the app's cookie jar keeps it like every other session cookie, and the
 * session is re-checked first so one revoked in between is not handed over.
 */
export async function POST(request: NextRequest) {
  const limited = checkBridgeRateLimit(request);
  if (limited) return limited;

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_EXCHANGE_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large", code: "INVALID_BODY" }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON.", code: "INVALID_BODY" }, { status: 400 });
  }
  const { code, verifier } = (raw ?? {}) as { code?: unknown; verifier?: unknown };
  if (typeof code !== "string" || typeof verifier !== "string" || code.length > 128 || verifier.length > 256) {
    return NextResponse.json({ error: "code and verifier are required.", code: "INVALID_BODY" }, { status: 400 });
  }

  const grant = exchangeGrant(code, verifier);
  if (!grant.ok) {
    return NextResponse.json(
      { error: "That sign-in has expired. Start again from the app.", code: "INVALID_GRANT" },
      { status: 401 },
    );
  }

  const session = await auth.api.getSession({
    headers: new Headers({ cookie: `${grant.cookieName}=${grant.cookieValue}` }),
  });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const response = NextResponse.json({
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
  });
  response.cookies.set(grant.cookieName, grant.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
    secure: grant.cookieName.startsWith("__Secure-") || request.nextUrl.protocol === "https:",
  });
  return response;
}
