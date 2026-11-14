import { headers } from "next/headers";
import { db } from "@workspace/db/client";
import { can, canAny } from "@workspace/db/permission-service";
import { OPS_KEYS } from "@workspace/db/permissions";
import { auth } from "./auth";

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Route guards resolved from what a role has been granted, not from a
 * hard-coded list of roles.
 *
 * Adding a role used to mean editing this file. Now a new role starts holding
 * nothing and is handed pages from the permission editor — no deploy, and no
 * chance of a role existing that no config knows about.
 */
export async function requirePermission(permission: string) {
  const session = await getSession();
  if (!session) return null;
  if (!(await can(db, session.user, permission))) return null;
  return session;
}

/** Any one of these is enough — for a route several areas can reach. */
export async function requireAnyPermission(permissions: string[]) {
  const session = await getSession();
  if (!session) return null;
  if (!(await canAny(db, session.user, permissions))) return null;
  return session;
}

/**
 * Opening the console at all. Every other check is narrower than this, so a
 * route that only needs "is this one of ours" uses it directly.
 */
export async function requireOperations() {
  return requireAnyPermission(OPS_KEYS);
}
