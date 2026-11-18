import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { clinicMember, user } from "@workspace/db/schema";
import { and, asc, eq, isNotNull, notInArray, sql } from "@workspace/db";
import { staffRoles } from "@workspace/db/role-service";
import { requireOperations } from "@/src/lib/auth/guards";

/**
 * Staff a lead can be handed to, and the roles they sit in — for the routing
 * rules editor and the reassign picker. Patients are never assignable.
 */
export async function GET() {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [people, roles, memberships] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user)
      .where(and(isNotNull(user.role), notInArray(user.role, ["user", "patient"]), sql`coalesce(${user.banned}, false) = false`))
      .orderBy(asc(user.name)),
    staffRoles(db),
    db
      .select({ userId: clinicMember.userId, clinicId: clinicMember.clinicId })
      .from(clinicMember)
      .where(eq(clinicMember.isActive, true)),
  ]);

  return NextResponse.json({
    // Which clinics each person works at, so a clinic's routing rule offers
    // only that clinic's people.
    people: people.map((p) => ({
      ...p,
      clinicIds: memberships.filter((m) => m.userId === p.id).map((m) => m.clinicId),
    })),
    roles: roles.map((r) => ({ key: r.key, label: r.label })),
  });
}
