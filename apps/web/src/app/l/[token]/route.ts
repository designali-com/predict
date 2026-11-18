import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@workspace/db/client";
import { redeemLoginLink } from "@workspace/db/login-link";
import { auth } from "@/src/lib/auth/auth";

/**
 * A clinic sign-in link: /l/<token>. Opening it signs the patient in and
 * opens the dashboard. Reusable until it expires; after that, or once the
 * clinic revokes it, it goes to the login page with a message.
 */

/**
 * WhatsApp, Telegram and the rest fetch a link to draw its preview. That
 * fetch must not sign anybody in — it would leave a session nobody holds.
 */
const PREVIEW_BOT = /whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot/i;

/**
 * The address the patient actually opened.
 *
 * Behind nginx the app listens on localhost:3000, and Next builds `req.url`
 * from that. A redirect based on it sends https://predict.fit/l/… to
 * http://localhost:3000/dashboard. The Host nginx forwards is the public one.
 */
function publicOrigin(req: NextRequest): string {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]?.trim();
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const local = !host || host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = forwarded || (local ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userAgent = req.headers.get("user-agent") ?? "";

  if (PREVIEW_BOT.test(userAgent)) {
    return new NextResponse(
      '<!doctype html><html><head><meta charset="utf-8"><title>Your Predict dashboard</title>' +
        '<meta property="og:title" content="Your Predict dashboard">' +
        '<meta property="og:description" content="Tap to open your health report and plan."></head><body></body></html>',
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }

  const redeemed = await redeemLoginLink(db, token);
  const origin = publicOrigin(req);
  if (!redeemed) {
    return NextResponse.redirect(new URL("/auth/login?link=expired", origin));
  }

  const ctx = await auth.$context;
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
  const session = await ctx.internalAdapter.createSession(redeemed.userId, false, { ipAddress, userAgent });

  // The cookie better-auth itself would set: "<token>.<HMAC-SHA256 signature>".
  const signature = createHmac("sha256", ctx.secret).update(session.token).digest("base64");
  const cookie = ctx.authCookies.sessionToken;

  const response = NextResponse.redirect(new URL("/dashboard", origin));
  response.headers.set("cache-control", "no-store");
  response.cookies.set(cookie.name, `${session.token}.${signature}`, {
    path: cookie.attributes.path ?? "/",
    httpOnly: true,
    secure: origin.startsWith("https://") || Boolean(cookie.attributes.secure),
    sameSite: "lax",
    maxAge: ctx.sessionConfig.expiresIn,
    ...(cookie.attributes.domain ? { domain: cookie.attributes.domain } : {}),
  });
  return response;
}
