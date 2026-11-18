import { createHash, createHmac } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, gt, isNull } from "drizzle-orm";
import { loginLink, user } from "./schema";
import type * as schema from "./schema";
import { issueLoginLink, revokeLoginLinks } from "./login-link";

type Db = NodePgDatabase<typeof schema>;

/**
 * A new staff member's first sign-in: a link (/welcome/<token>) where they
 * choose their own password, instead of a generated one sent around in
 * messages. WhatsApp cannot carry a password at all (Meta rejects the
 * template), and a link they finish themselves never has to.
 *
 * Built on the same login_link table as the patients' sign-in links: a random
 * token, only its hash stored, 7 days to use it. Setting the password revokes
 * it, so it works once.
 */

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Make a link for this account. The token is returned once and never stored. */
export async function issueWelcomeLink(db: Db, input: { userId: string; createdByUserId: string | null; appUrl: string }) {
  const { token, expiresAt } = await issueLoginLink(db, { userId: input.userId, createdByUserId: input.createdByUserId });
  return { url: `${input.appUrl.replace(/\/$/, "")}/welcome/${token}`, expiresAt };
}

/** Who a link is for, if it still works — read without using it up. */
export async function peekWelcomeLink(db: Db, token: string) {
  const [row] = await db
    .select({ userId: loginLink.userId, name: user.name, email: user.email, banned: user.banned })
    .from(loginLink)
    .innerJoin(user, eq(user.id, loginLink.userId))
    .where(and(eq(loginLink.tokenHash, hashToken(token)), isNull(loginLink.revokedAt), gt(loginLink.expiresAt, new Date())))
    .limit(1);
  if (!row || row.banned) return null;
  return { userId: row.userId, name: row.name, email: row.email };
}

/** The parts of a better-auth context this needs — passed in by each app. */
export interface AuthContextLike {
  secret: string;
  password: { hash(password: string): Promise<string> };
  internalAdapter: {
    updatePassword(userId: string, password: string): Promise<unknown>;
    createSession(userId: string, dontRememberMe?: boolean, override?: Record<string, unknown>): Promise<{ token: string }>;
  };
  authCookies: { sessionToken: { name: string; attributes: { path?: string; secure?: boolean; domain?: string } } };
  sessionConfig: { expiresIn: number };
}

export const MIN_PASSWORD = 8;

/**
 * Set their password, end the link, and sign them in. Returns the session
 * cookie to set — the same "<token>.<HMAC>" better-auth itself would set.
 */
export async function completeWelcome(
  db: Db,
  ctx: AuthContextLike,
  input: { token: string; password: string; ipAddress?: string; userAgent?: string },
): Promise<
  | { ok: true; cookie: { name: string; value: string; path: string; secure: boolean; domain?: string; maxAge: number } }
  | { ok: false; error: string }
> {
  if (input.password.length < MIN_PASSWORD) {
    return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` };
  }
  const who = await peekWelcomeLink(db, input.token);
  if (!who) return { ok: false, error: "This link has expired or was already used. Ask your admin for a new one." };

  await ctx.internalAdapter.updatePassword(who.userId, await ctx.password.hash(input.password));
  // One use: the password is theirs now, nobody else should hold a way in.
  await revokeLoginLinks(db, who.userId);

  const session = await ctx.internalAdapter.createSession(who.userId, false, {
    ipAddress: input.ipAddress ?? "",
    userAgent: input.userAgent ?? "",
  });
  const signature = createHmac("sha256", ctx.secret).update(session.token).digest("base64");
  const cookie = ctx.authCookies.sessionToken;
  return {
    ok: true,
    cookie: {
      name: cookie.name,
      value: `${session.token}.${signature}`,
      path: cookie.attributes.path ?? "/",
      secure: Boolean(cookie.attributes.secure),
      ...(cookie.attributes.domain ? { domain: cookie.attributes.domain } : {}),
      maxAge: ctx.sessionConfig.expiresIn,
    },
  };
}
