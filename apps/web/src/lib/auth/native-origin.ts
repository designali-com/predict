/**
 * The mobile apps' Origin.
 *
 * Better Auth refuses any cookie-bearing request with no `Origin` header. A
 * browser always sends one; the Android (OkHttp) and iOS (URLSession) clients
 * do not, so they send this custom-scheme value on every request
 * (`ApiClient.kt`, `ApiClient.swift`) and `auth.ts` trusts it. No browser ever
 * emits `Origin: predict://…`, so this does not loosen the web's CSRF check.
 *
 * Trusting it has a second effect: `callbackURL`, `redirectTo`,
 * `errorCallbackURL` and `newUserCallbackURL` are validated against the same
 * list, which would make `predict://…` a valid place to redirect a freshly
 * signed-in browser — carrying the session cookie into a scheme any installed
 * app can claim. auth.ts's before-hook refuses that (body and query) before Better
 * Auth's handler runs; the app signs in through `/auth/mobile/*`, which hands it a
 * one-time code instead (see mobile-bridge.ts).
 *
 * Ported from the mobile branch (feat/health-data-foundation, WC-152).
 */

/** Sent by both apps on every request; trusted by `auth.ts`. */
export const NATIVE_ORIGIN = "predict://fit.predict.app";

/** The redirect-bearing fields Better Auth validates against `trustedOrigins`. */
export const CALLBACK_FIELDS = ["callbackURL", "redirectTo", "errorCallbackURL", "newUserCallbackURL"] as const;

/** True when any redirect-bearing field names the native scheme, however spelled. */
export function refusesNativeCallback(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const record = body as Record<string, unknown>;
  return CALLBACK_FIELDS.some((field) => {
    // Better Auth accepts an array for these too, so a string-only test would leak.
    const value = record[field];
    const candidates = Array.isArray(value) ? value : [value];
    return candidates.some((candidate) => typeof candidate === "string" && /^\s*predict:/i.test(candidate));
  });
}

