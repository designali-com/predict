import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/src/lib/auth/auth";
import {
  CHALLENGE_COOKIE,
  CHALLENGE_COOKIE_TTL_S,
  checkBridgeRateLimit,
  isBrowserProvider,
  isChallenge,
} from "@/src/lib/auth/mobile-bridge";

/**
 * Step 1 of the apps' browser sign-in (see lib/auth/mobile-bridge.ts).
 *
 * The app opens a system-browser tab here with the provider and the SHA-256 of
 * a verifier only it holds. Better Auth begins the provider's OAuth exactly as
 * the web login page does, landing on `/auth/mobile/complete?challenge=…`; its
 * state cookie is forwarded on the redirect so the browser carries it there
 * and back. The challenge is also left in a cookie, so `complete` mints a code
 * only for a flow that began on this browser.
 */
export async function GET(request: NextRequest) {
  const limited = checkBridgeRateLimit(request);
  if (limited) return limited;

  const provider = request.nextUrl.searchParams.get("provider");
  const challenge = request.nextUrl.searchParams.get("challenge");

  if (!isBrowserProvider(provider) || !isChallenge(challenge)) {
    return NextResponse.json(
      { error: "provider must be google or apple, and challenge a 43-character base64url SHA-256.", code: "INVALID_BODY" },
      { status: 400 },
    );
  }

  const providers = (auth.options.socialProviders ?? {}) as Record<string, unknown>;
  if (!providers[provider]) {
    return NextResponse.json(
      { error: `${provider} sign-in is not configured on this server.`, code: "PROVIDER_NOT_CONFIGURED" },
      { status: 404 },
    );
  }

  const completeUrl = `/auth/mobile/complete?challenge=${challenge}`;
  const started = await auth.api.signInSocial({
    body: {
      provider,
      callbackURL: completeUrl,
      errorCallbackURL: `${completeUrl}&error=provider`,
      // We redirect ourselves, so the state cookie rides on our response.
      disableRedirect: true,
    },
    headers: await headers(),
    returnHeaders: true,
  });

  const url = started.response?.url;
  if (!url) {
    return NextResponse.json(
      { error: "The provider did not return a place to sign in.", code: "PROVIDER_UNAVAILABLE" },
      { status: 502 },
    );
  }

  // Raw Set-Cookie headers: response.cookies.set() would drop the one appended
  // by hand, losing Better Auth's state cookie and failing every callback.
  const response = NextResponse.redirect(url, 302);
  // Carries one browser's OAuth state — never let anything cache it.
  response.headers.set("cache-control", "no-store");
  for (const cookie of started.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  const secure = request.nextUrl.protocol === "https:" ? "; Secure" : "";
  response.headers.append(
    "set-cookie",
    `${CHALLENGE_COOKIE}=${challenge}; Path=/auth/mobile; Max-Age=${CHALLENGE_COOKIE_TTL_S}; HttpOnly; SameSite=Lax${secure}`,
  );
  return response;
}
