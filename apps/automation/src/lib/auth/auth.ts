import { db } from "@workspace/db/client";
import * as schema from "@workspace/db/schema";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { demoTrustedOrigins } from "@workspace/db/demo-env";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access";
import { ADMIN_ROLES, ALL_ROLES, isAdminRole } from "@workspace/db/roles";

// Same user/session/account tables as apps/web (shared database) — this app
// doesn't create accounts, it just authenticates against the ones that
// already exist. Staff log in here with the same email/password they use
// on the main site.
const ac = createAccessControl(defaultStatements);

// Derived from the shared list rather than typed out again. This map exists in
// all three apps, and a role added to two of them and forgotten in the third
// fails only on whichever one happens to do the assigning — see
// @workspace/db/roles.
const roles = Object.fromEntries(
  ALL_ROLES.map((role) => [
    role,
    ac.newRole(isAdminRole(role) ? adminAc.statements : userAc.statements),
  ]),
);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.user,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  // This dashboard runs on its own port (3001 in dev, since apps/web
  // already takes 3000) — better-auth rejects any origin not listed here.
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    "http://localhost:3000",
    "http://localhost:3001",
    ...demoTrustedOrigins(),
  ].filter((origin): origin is string => Boolean(origin)),
  plugins: [
    nextCookies(),
    admin({
      defaultRole: "user",
      adminRoles: [...ADMIN_ROLES],
      ac,
      roles,
    }),
  ],
});
