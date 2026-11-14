import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/src/lib/auth/auth";
import {
  CHALLENGE_COOKIE,
  MOBILE_REDIRECT_URI,
  checkBridgeRateLimit,
  findSessionCookie,
  isChallenge,
  mintGrant,
} from "@/src/lib/auth/mobile-bridge";

/**
 * Step 3 of the apps' browser sign-in. The provider has sent the browser back
 * and Better Auth has already set the session cookie on it.
 *
 * If the challenge matches the one `start` left, and there is a live session,
 * mint a one-time code bound to that cookie and challenge, clear the session
 * cookie from the tab (the session lives on — the phone is about to hold it),
 * and hand the code to the app.
 *
 * A small HTML page rather than a 302 to `predict://…`: Chrome on Android does
 * not always follow a server redirect into another app without a tap, so the
 * page tries `location.replace` and also shows an "Open Predict" button.
 * Every failure goes back the same way, as `?error=<reason>`.
 */
export async function GET(request: NextRequest) {
  if (checkBridgeRateLimit(request)) return handBack({ error: "rate_limited" });

  const params = request.nextUrl.searchParams;
  const challenge = params.get("challenge");
  if (!isChallenge(challenge)) return handBack({ error: "bad_request" });
  if (params.get("error")) return handBack({ error: "provider" });

  // The flow must have begun at `start` on THIS browser.
  if (request.cookies.get(CHALLENGE_COOKIE)?.value !== challenge) return handBack({ error: "no_start" });

  const session = await auth.api.getSession({ headers: await headers() });
  const cookie = findSessionCookie(request.cookies.getAll());
  if (!session || !cookie) return handBack({ error: "no_session" });

  const code = mintGrant({ cookieName: cookie.name, cookieValue: cookie.value, challenge });
  const response = handBack({ code });
  // `Secure` is required to delete a `__Secure-` cookie, or the browser ignores
  // the deletion and the tab keeps a live session.
  const secure = cookie.name.startsWith("__Secure-") || request.nextUrl.protocol === "https:";
  response.cookies.set(cookie.name, "", { maxAge: 0, path: "/", secure, httpOnly: true, sameSite: "lax" });
  response.cookies.set(CHALLENGE_COOKIE, "", { maxAge: 0, path: "/auth/mobile", secure, httpOnly: true, sameSite: "lax" });
  return response;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * Every value inlined here is a base64url code minted above or a word from a
 * fixed set — never request text — which is the only reason inlining is safe.
 */
function handBack(query: Record<string, string>): NextResponse {
  const target = `${MOBILE_REDIRECT_URI}?${new URLSearchParams(query).toString()}`;
  const line = "code" in query ? "Signed in. Taking you back to Predict." : "That sign-in did not finish. Go back to Predict and try again.";
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>Predict</title>` +
    `<style>:root{color-scheme:dark}` +
    `body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060309;color:#efefef;` +
    `font:15px/1.5 system-ui,sans-serif;text-align:center;padding:24px}a{display:inline-block;margin-top:18px;` +
    `padding:14px 22px;border-radius:16px;background:#7c3aed;color:#efefef;text-decoration:none;font-weight:600}</style></head>` +
    `<body><main><p>${escapeHtml(line)}</p><a href="${escapeHtml(target)}">Open Predict</a></main>` +
    `<script>location.replace(${JSON.stringify(target)})</script></body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    },
  });
}
