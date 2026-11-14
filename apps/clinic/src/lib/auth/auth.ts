import { db } from "@workspace/db/client";
import * as schema from "@workspace/db/schema";
import { sendEmail } from "./email";
import { betterAuth } from "better-auth";
import { admin, emailOTP } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { ADMIN_ROLES, ALL_ROLES, isAdminRole } from "@workspace/db/roles";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { demoTrustedOrigins } from "@workspace/db/demo-env";

export const auth = betterAuth({
  // The lab answers on its own host (lab.predict.fit) from this same app;
  // sign-in there is a request from that origin, which must be trusted.
  trustedOrigins: [...(process.env.NEXT_PUBLIC_LAB_URL ? [process.env.NEXT_PUBLIC_LAB_URL] : []), ...demoTrustedOrigins()],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.user,
    },
  }),
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    // Verification is not a gate: users sign in immediately and
    // user.emailVerified is informational only. The column stays because
    // better-auth requires it, and the flow below still works for anyone
    // who verifies deliberately or is auto-verified at creation.
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your email address",
        text: `Click the link to verify your email: ${url}`,
      });
    },
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
  },
  socialProviders: { 
    google: {
      prompt: "select_account",
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    admin({ 
      defaultRole: "user",
      adminRoles: [...ADMIN_ROLES],
      // better-auth validates every role value (createUser, setRole, ...)
      // against this map — any role not listed here is rejected as
      // "non-existent", even ones that aren't admin roles at all. So every
      // role string the app actually assigns has to be declared, not just
      // "admin"/"superadmin". Only admin/superadmin get real admin-API
      // permissions (adminAc); everyone else gets none (userAc), matching
      // least privilege — these role values exist for our own app's
      // authorization (see src/lib/auth/config.ts), not better-auth's.
      // Derived from the shared list rather than typed out again. With three
      // apps each declaring this map, a role added to two of them and missed
      // in the third fails only on whichever app happens to do the assigning —
      // see @workspace/db/roles.
      roles: Object.fromEntries(
        ALL_ROLES.map((role) => [role, isAdminRole(role) ? adminAc : userAc]),
      ),
    }),
    emailOTP({ // 👈 OTP Plugin
      async sendVerificationOTP({ email, otp, type }) {
        await sendEmail({
          to: email,
          subject: "Your Login OTP Code",
          text: `Your OTP for login is: ${otp}`,
        });
      },
    }),
    nextCookies(),
  ],
});