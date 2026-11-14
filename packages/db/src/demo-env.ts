/**
 * Zero-config demo: every setting the apps need, with a working default.
 *
 * Imported first by ./client (which every server path loads), it fills in only
 * what is not already set — a local .env, or a value set on Vercel, still wins.
 * So the repo deploys to Vercel with no environment variables at all.
 *
 * The database login here is a demo-only Neon role (predict_demo_app): it can
 * open the predict_demo database and nothing else on that Neon project. The
 * data behind it is fictional and is wiped and re-seeded every night, so this
 * being public is the point, not a leak. Never put a real database here.
 */

const DEMO_DEFAULTS: Record<string, string> = {
  DEMO_MODE: "1",
  NEXT_PUBLIC_DEMO_MODE: "1",
  DATABASE_URL: "postgresql://predict_demo_app:sa3r7lyLg5bNjY3HlFkUMXsG@ep-tiny-block-avotpdir-pooler.c-11.us-east-1.aws.neon.tech/predict_demo?sslmode=require&channel_binding=require",
  DIRECT_URL: "postgresql://predict_demo_app:sa3r7lyLg5bNjY3HlFkUMXsG@ep-tiny-block-avotpdir.c-11.us-east-1.aws.neon.tech/predict_demo?sslmode=require&channel_binding=require",
  // Signs demo sessions only. Public on purpose — there is nothing real to protect.
  BETTER_AUTH_SECRET: "predict-demo-public-secret-1f8c2a7e9b4d6053a1c8e2f7b9d4a6c3",
  // Dummy keys: the network guard (./demo-mode) answers every outside call.
  WHATSAPP_PHONE_NUMBER_ID: "demo",
  WHATSAPP_ACCESS_TOKEN: "demo",
  WHATSAPP_WABA_ID: "demo",
  WHATSAPP_APP_ID: "demo",
  META_PAGE_ACCESS_TOKEN: "demo",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "demo",
  EMAIL_FROM: "Predict Demo <demo@example.com>",
  // The three apps' addresses on Vercel — name the Vercel projects to match,
  // or set these variables to the real domains.
  NEXT_PUBLIC_APP_URL: "https://predictfitdemo.vercel.app",
  NEXT_PUBLIC_PATIENT_URL: "https://predictfitdemo.vercel.app",
  NEXT_PUBLIC_OPERATIONS_URL: "https://predictfitdemo-ops.vercel.app",
  NEXT_PUBLIC_CLINIC_URL: "https://predictfitdemo-clinic.vercel.app",
};

for (const [key, value] of Object.entries(DEMO_DEFAULTS)) {
  if (!process.env[key]) process.env[key] = value;
}

// Each app's own address: Vercel tells us its production domain.
if (!process.env.BETTER_AUTH_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  process.env.BETTER_AUTH_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
}

export const DEMO_DEFAULT_KEYS = Object.keys(DEMO_DEFAULTS);

/**
 * Origins sign-in accepts in the demo: every Vercel address (production,
 * previews, a renamed project) and the three apps' own addresses. Without it
 * a project renamed in Vercel — a new .vercel.app domain — refused every
 * sign-in with "Invalid origin".
 */
export function demoTrustedOrigins(): string[] {
  return [
    "https://*.vercel.app",
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_PATIENT_URL,
    process.env.NEXT_PUBLIC_OPERATIONS_URL,
    process.env.NEXT_PUBLIC_CLINIC_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
  ].filter((o): o is string => Boolean(o));
}
