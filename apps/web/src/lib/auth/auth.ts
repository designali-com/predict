import { db } from "@workspace/db/client";
import * as schema from "@workspace/db/schema";
import { sendEmail } from "./email";
import { otpSendContext } from "./otp-context";
import { deliverOtp } from "@workspace/communication/otp";
import { isPlaceholderEmail } from "@workspace/db/login-link";
import { betterAuth } from "better-auth";
import { admin, bearer, emailOTP, phoneNumber } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { ADMIN_ROLES, ALL_ROLES, isAdminRole } from "@workspace/db/roles";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { demoTrustedOrigins } from "@workspace/db/demo-env";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { normalizePhone } from "@workspace/db/normalize-phone";
import { NATIVE_ORIGIN, refusesNativeCallback } from "./native-origin";

export const auth = betterAuth({
  // The Android and iOS apps send `Origin: predict://fit.predict.app` on every
  // request (they are not browsers and would otherwise send none). Trusting it
  // is safe only with the native-callback refusal below — see native-origin.ts.
  trustedOrigins: [NATIVE_ORIGIN, ...demoTrustedOrigins()],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // A sign-in must never redirect into predict:// — that would hand the
      // session cookie to whichever app claims the scheme.
      if (refusesNativeCallback(ctx.body) || refusesNativeCallback(ctx.query)) {
        throw new APIError("FORBIDDEN", {
          message: "A native-scheme redirect is never a valid callback. The app signs in through /auth/mobile.",
          code: "NATIVE_SCHEME_CALLBACK_REFUSED",
        });
      }
      // The apps send numbers as E.164 ("+919876543210"); accounts store
      // country code and digits only. Same number, so meet it here rather
      // than refuse it in the validator.
      if (ctx.path.startsWith("/phone-number/") && typeof ctx.body?.phoneNumber === "string") {
        const normalized = normalizePhone(ctx.body.phoneNumber);
        if (normalized.ok && normalized.phone !== ctx.body.phoneNumber) {
          return { context: { body: { ...ctx.body, phoneNumber: normalized.phone } } };
        }
      }
    }),
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.user,
    },
  }),
  // Somebody who signs up on the predict.fit app becomes a contact on
  // Predict's books there and then. Before, a contact was only made when they
  // first booked something, so new sign-ups showed up nowhere. A number or
  // email already on file links to that contact instead (see
  // upsertContactForRegisteredUser). Never blocks the sign-up itself.
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          const role = (created as { role?: string | null }).role ?? "user";
          if (role !== "user" && role !== "patient") return;
          try {
            const { upsertContactForRegisteredUser } = await import("@/src/lib/contact");
            await upsertContactForRegisteredUser({
              userId: created.id,
              email: created.email,
              name: created.name || null,
              phone: (created as { phoneNumber?: string | null }).phoneNumber ?? null,
            });
          } catch (err) {
            console.error("[auth] could not create a contact for a new sign-up:", err);
          }
        },
      },
    },
  },
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
      // The Web client first — it runs the browser sign-in and is the audience the
      // Android app asks Google for. The Android client is accepted as an audience
      // too, so a token issued to it directly (no serverClientId) still verifies.
      clientId: [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_ANDROID_CLIENT_ID].filter(
        (id): id is string => Boolean(id),
      ),
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
      // Derived from the shared list rather than typed out again — see
      // @workspace/db/roles for why three hand-maintained copies is a trap.
      roles: Object.fromEntries(
        ALL_ROLES.map((role) => [role, isAdminRole(role) ? adminAc : userAc]),
      ),
    }),
    // Mobile-number sign-in. better-auth generates, stores, expires and checks
    // the code; which channel it leaves on — WhatsApp, then SMS — is decided
    // by /api/login-otp/send under the attempt policy and handed in through
    // otpSendContext.
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      // Wrong-code guesses per code. Three, then the code is dead and a new
      // one has to be requested — which counts against the send limits.
      allowedAttempts: 3,
      // Stored form only: country code and digits, no "+". The send route
      // normalizes before it gets here; anything else is a direct call.
      phoneNumberValidator: (phone) => /^[0-9]{10,15}$/.test(phone),
      async sendOTP({ phoneNumber: phone, code }) {
        const context = otpSendContext.getStore();
        if (!context) {
          // Someone called better-auth's own /phone-number/send-otp, which
          // sends to any number with no check. Refused: codes go out only
          // through /api/login-otp/send, where the limits are.
          throw new Error("Direct OTP sends are disabled — use /api/login-otp/send");
        }
        context.result = await deliverOtp({ phone, code, channel: context.channel });
      },
    }),
    emailOTP({ // 👈 OTP Plugin
      async sendVerificationOTP({ email, otp, type }) {
        // Mobile-only accounts carry a placeholder address; there is no inbox.
        if (isPlaceholderEmail(email)) return;
        await sendEmail({
          to: email,
          subject: "Your Login OTP Code",
          text: `Your OTP for login is: ${otp}`,
        });
      },
    }),
    // Mobile apps may hold the session as a token instead of a cookie: every
    // sign-in answers with `token` (and a `set-auth-token` header), and
    // `Authorization: Bearer <token>` is then accepted wherever the cookie is.
    bearer(),
    nextCookies(),
  ],
});