import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * The mobile apps' browser sign-in bridge (Google, and Apple once configured).
 *
 * A native app cannot run an OAuth dance itself — Google and Apple refuse
 * embedded webviews — so it opens the SYSTEM browser at this server, the
 * server runs the provider's OAuth exactly as for a web visitor (same Web
 * client, same `/api/auth/callback/google` redirect), and the browser hands
 * the result back on `predict://auth/complete`.
 *
 * The URL never carries the session cookie — any installed app can claim a
 * custom scheme. It carries a one-time CODE, which the app trades for the
 * cookie over HTTPS with a PKCE verifier only it holds:
 *
 *   1. app → `/auth/mobile/start?provider=google&challenge=sha256(verifier)`
 *   2. server starts OAuth with `/auth/mobile/complete?challenge=…` as the
 *      callback, and leaves the challenge in a short-lived cookie
 *   3. provider → `complete`, now signed in: mint a code bound to (session
 *      cookie, challenge), clear the cookie from the tab, hand the code to
 *      `predict://auth/complete?code=…`
 *   4. app POSTs `{code, verifier}` to `/auth/mobile/exchange` and gets the
 *      session back as a Set-Cookie.
 *
 * This is why the apps need no Android or iOS OAuth client of their own:
 * Google only ever sees the Web client.
 *
 * Ported from the mobile branch (feat/health-data-foundation, WC-147).
 */

/** Where the browser hands the phone back. A constant — never read from a request. */
export const MOBILE_REDIRECT_URI = "predict://auth/complete";

/** A minted code's life: the tab-to-app hop, plus a slow "Open Predict" tap. */
export const GRANT_TTL_MS = 60_000;

/** The cookie `start` leaves on the browser so `complete` knows the flow began here. */
export const CHALLENGE_COOKIE = "predict-mobile-challenge";
export const CHALLENGE_COOKIE_TTL_S = 10 * 60;

export const BROWSER_PROVIDERS = ["google", "apple"] as const;
export type BrowserProvider = (typeof BROWSER_PROVIDERS)[number];

export function isBrowserProvider(value: unknown): value is BrowserProvider {
  return typeof value === "string" && (BROWSER_PROVIDERS as readonly string[]).includes(value);
}

/** SHA-256 as base64url is always 43 characters. */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE.test(value);
}

export function sha256Base64Url(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("base64url");
}

/** Better Auth's session cookie — `__Secure-` prefixed over https, so match the suffix. */
export function findSessionCookie<T extends { name: string; value: string }>(cookies: T[]): T | undefined {
  return cookies.find((c) => c.name.endsWith("session_token"));
}

type Grant = { cookieName: string; cookieValue: string; challenge: string; expiresAt: number };

// In-process: one web instance serves a sign-in end to end. During a
// blue/green switch a code minted on the old instance and traded on the new
// one fails closed (UNKNOWN_CODE) and the person taps Google again.
const grants = new Map<string, Grant>();

/** Mint a one-time code for a session cookie, bound to the app's PKCE challenge. */
export function mintGrant(grant: Omit<Grant, "expiresAt">, now = Date.now()): string {
  sweep(now);
  const code = randomBytes(32).toString("base64url");
  // Stored by hash, so reading the map is not reading live codes.
  grants.set(sha256Base64Url(code), { ...grant, expiresAt: now + GRANT_TTL_MS });
  return code;
}

export type Exchange =
  | { ok: true; cookieName: string; cookieValue: string }
  | { ok: false; reason: "UNKNOWN_CODE" | "EXPIRED" | "VERIFIER_MISMATCH" };

/** Trade a code and its verifier for the cookie. A wrong verifier burns the code. */
export function exchangeGrant(code: string, verifier: string, now = Date.now()): Exchange {
  const key = sha256Base64Url(code);
  const grant = grants.get(key);
  grants.delete(key);
  if (!grant) return { ok: false, reason: "UNKNOWN_CODE" };
  if (grant.expiresAt <= now) return { ok: false, reason: "EXPIRED" };

  const expected = Buffer.from(grant.challenge, "utf8");
  const actual = Buffer.from(sha256Base64Url(verifier), "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "VERIFIER_MISMATCH" };
  }
  return { ok: true, cookieName: grant.cookieName, cookieValue: grant.cookieValue };
}

function sweep(now: number) {
  for (const [key, grant] of grants) {
    if (grant.expiresAt <= now) grants.delete(key);
  }
}

/* ── a small limit on the bridge, per caller IP ──────────────────────────── */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * One bucket for start, complete and exchange together — they are one flow.
 * The routes are public by design, so this bounds what a script can make the
 * server do. Returns the 429 to send, or null when under budget.
 */
export function checkBridgeRateLimit(request: Request): NextResponse | null {
  const now = Date.now();
  const key = clientIp(request);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= MAX_PER_WINDOW) return null;
  const retry = Math.ceil((bucket.resetAt - now) / 1000);
  return NextResponse.json(
    { error: "Too many requests. Try again shortly.", code: "RATE_LIMITED" },
    { status: 429, headers: { "Retry-After": String(retry), "X-Retry-After": String(retry) } },
  );
}
