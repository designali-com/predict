import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { and, eq, isNull, or, sql, type SQL } from "@workspace/db";
import { can } from "@workspace/db/permission-service";
import { resolveRole } from "@workspace/db/roles";

interface Principal {
  id: string;
  role?: string | null;
}

export interface LeadScope {
  /** Holds ops.leads_all — sees every lead, can reassign. */
  all: boolean;
  userId: string;
  role: string;
}

/**
 * Whose leads this person may see. With ops.leads_all: everyone's. Without
 * it (a telecaller role): leads assigned to them, plus unclaimed leads routed
 * to their role's pool.
 */
export async function leadScope(user: Principal): Promise<LeadScope> {
  return {
    all: await can(db, user as Parameters<typeof can>[1], "ops.leads_all"),
    userId: user.id,
    role: resolveRole(user.role),
  };
}

/** The WHERE clause for a restricted scope; undefined when unrestricted. */
export function leadVisibility(scope: LeadScope): SQL | undefined {
  if (scope.all) return undefined;
  return or(
    eq(contact.assignedUserId, scope.userId),
    and(isNull(contact.assignedUserId), eq(contact.assignedRole, scope.role)),
  );
}

/** Can this person open this one contact? Only lead-side rows are narrowed. */
export async function canSeeLead(scope: LeadScope, contactId: string): Promise<boolean> {
  if (scope.all) return true;
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(contact)
    .where(and(eq(contact.id, contactId), leadVisibility(scope)))
    .limit(1);
  return !!row;
}
