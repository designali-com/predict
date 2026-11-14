/**
 * Creates (or resets) a superadmin login directly in the database.
 *
 * Better Auth has no public "bootstrap the first admin" endpoint — the admin
 * plugin's createUser requires an existing admin session — so the very first
 * superadmin has to be written here.
 *
 * We insert the same two rows a normal email+password signup would:
 * - a `user` row with role = superadmin
 * - a `credential` `account` row holding the password hash
 *
 * The hash comes from better-auth's own hashPassword (scrypt), which is the
 * default hasher the app's auth config uses — so the resulting password
 * verifies through the normal login flow.
 *
 * Usage:
 * pnpm --filter @workspace/db create:superadmin
 * pnpm --filter @workspace/db create:superadmin -- --email me@x.com
 * pnpm --filter @workspace/db create:superadmin -- --password 'MyPassword'
 *
 * Flags:
 * --email     defaults to SUPERADMIN_EMAIL or superadmin@predict.fit
 * --password  defaults to Predict@123
 * --name      defaults to SUPERADMIN_NAME or "Super Admin"
 * --role      defaults to "superadmin"
 *
 * Re-running with an existing email does not create a duplicate:
 * it promotes that user to the role, marks the email verified,
 * un-bans them, and resets the password.
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db } from "../src/client";
import { account, user } from "../src/schema";

const CREDENTIAL_PROVIDER_ID = "credential";

const DEFAULT_EMAIL = "admin@example.com";
const DEFAULT_NAME = "Ali Imam";
const DEFAULT_ROLE = "patient";
const DEFAULT_PASSWORD = "Predict@123";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg?.startsWith("--")) continue;

    // Supports both:
    // --email x@example.com
    // --email=x@example.com
    const [key, inlineValue] = arg.slice(2).split(/=(.*)/s);

    if (!key) continue;

    const value = inlineValue ?? argv[++i];

    if (value !== undefined) {
      flags[key] = value;
    }
  }

  return flags;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set (expected in packages/db/.env)",
    );
  }

  const flags = parseFlags(process.argv.slice(2));

  const email = (
    flags.email ??
    process.env.SUPERADMIN_EMAIL ??
    DEFAULT_EMAIL
  )
    .trim()
    .toLowerCase();

  const name =
    flags.name ??
    process.env.SUPERADMIN_NAME ??
    DEFAULT_NAME;

  const role = (
    flags.role ??
    DEFAULT_ROLE
  )
    .trim()
    .toLowerCase();

  // Password priority:
  // 1. --password flag
  // 2. SUPERADMIN_PASSWORD environment variable
  // 3. Predict@123
  const password =
    flags.password ??
    process.env.SUPERADMIN_PASSWORD ??
    DEFAULT_PASSWORD;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`Not a valid email: ${email}`);
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  const existing = await db.query.user.findFirst({
    where: eq(user.email, email),
  });

  let userId: string;
  let action: "created" | "updated";

  if (existing) {
    userId = existing.id;
    action = "updated";

    await db
      .update(user)
      .set({
        role,
        name,
        emailVerified: true,
        banned: false,
        banReason: null,
        banExpires: null,
        updatedAt: now,
      })
      .where(eq(user.id, userId));
  } else {
    userId = randomUUID();
    action = "created";

    await db.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      role,
      banned: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  // A user may already have a Google account row.
  // Only the credential account carries the password,
  // so scope the lookup to the credential provider.
  const existingCredential = await db.query.account.findFirst({
    where: and(
      eq(account.userId, userId),
      eq(account.providerId, CREDENTIAL_PROVIDER_ID),
    ),
  });

  if (existingCredential) {
    await db
      .update(account)
      .set({
        password: passwordHash,
        updatedAt: now,
      })
      .where(eq(account.id, existingCredential.id));
  } else {
    await db.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: CREDENTIAL_PROVIDER_ID,
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log(`\n✅ Superadmin ${action}\n`);

  console.log(`   email:    ${email}`);
  console.log(`   password: ${password}`);
  console.log(`   role:     ${role}`);
  console.log(`   user id:  ${userId}`);

  console.log(`\n   Sign in at /auth/login`);
  console.log(`   Redirects to /${role}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Failed to create superadmin\n");
    console.error(error);
    process.exit(1);
  });