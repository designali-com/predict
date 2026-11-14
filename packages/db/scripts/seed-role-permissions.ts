import "dotenv/config";
import { db } from "../src/client";
import { rolePermission } from "../src/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_GRANTS, PERMISSION_KEYS } from "../src/permissions";

/**
 * Seeds each role with exactly what it could already reach before access
 * became editable — so switching the apps over changes nothing for anyone.
 *
 * Two modes.
 *
 * Default: only fills in roles with no rows at all. Once a role has been
 * configured in the panel this script leaves it alone — otherwise every deploy
 * would quietly undo whatever the clinic had set, which is the worst possible
 * behaviour for a permissions system.
 *
 *   --backfill: additionally grants defaults that are *missing* from an
 *   already-configured role, and never revokes anything. That is for the case
 *   where an existing page gains a permission key for the first time: the roles
 *   that could already reach it should keep reaching it, and leaving them to
 *   discover the link had vanished would be a silent removal of access.
 *   It is not for changing policy — a revoked permission stays revoked.
 *
 * Superadmin is absent on purpose and stays that way — it bypasses the table
 * entirely, so that a mis-click can never remove the ability to undo itself.
 */
const BACKFILL = process.argv.includes("--backfill");

async function seed() {
  let seeded = 0;
  let skipped = 0;
  let backfilled = 0;

  for (const [role, permissions] of Object.entries(DEFAULT_GRANTS)) {
    const existing = await db
      .select({ permission: rolePermission.permission })
      .from(rolePermission)
      .where(eq(rolePermission.role, role));

    if (existing.length > 0) {
      if (!BACKFILL) {
        console.log(`  skip  ${role} — already configured, leaving it alone`);
        skipped++;
        continue;
      }

      const held = new Set(existing.map((r) => r.permission));
      const missing = permissions.filter((p) => !held.has(p));
      if (missing.length === 0) {
        console.log(`  ok    ${role} — nothing missing`);
        skipped++;
        continue;
      }

      await db
        .insert(rolePermission)
        .values(missing.map((permission) => ({ role, permission })))
        .onConflictDoNothing({ target: [rolePermission.role, rolePermission.permission] });

      console.log(`  fill  ${role} — added ${missing.join(", ")}`);
      backfilled++;
      continue;
    }

    const valid = permissions.filter((p) => PERMISSION_KEYS.includes(p));
    const unknown = permissions.filter((p) => !PERMISSION_KEYS.includes(p));
    if (unknown.length) {
      throw new Error(`DEFAULT_GRANTS["${role}"] names unknown permissions: ${unknown.join(", ")}`);
    }

    await db
      .insert(rolePermission)
      .values(valid.map((permission) => ({ role, permission })))
      .onConflictDoNothing({ target: [rolePermission.role, rolePermission.permission] });

    console.log(`  seed  ${role} — ${valid.length} permission(s)`);
    seeded++;
  }

  console.log(`\n${seeded} seeded, ${backfilled} backfilled, ${skipped} unchanged.`);
  console.log("Superadmin is not listed: it bypasses the table and always holds everything.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
