import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { leadRule } from "@workspace/db/schema";
import { asc } from "@workspace/db";
import { requireClinicPermission } from "@/src/lib/auth/clinic";
import { isSuperadmin } from "@workspace/db/clinic-service";
import { parseRule } from "./parse";

export async function GET() {
  const context = await requireClinicPermission("ops.lead_routing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rules = await db
    .select()
    .from(leadRule)
    .orderBy(asc(leadRule.kind), asc(leadRule.priority), asc(leadRule.createdAt));

  // Assignment rules are the map between clinics — you have to see the other
  // clinic's rule to understand why a far-away lead went there — but only
  // your own are editable. ICP rules are shared by every clinic.
  const mine = new Set(context.memberships.map((m) => m.clinic.id));
  return NextResponse.json({
    rules: rules.map((r) => ({
      ...r,
      editable: isSuperadmin(context.session.user.role) || !r.clinicId || mine.has(r.clinicId),
    })),
    clinics: context.memberships.map((m) => ({ id: m.clinic.id, name: m.clinic.name })),
    activeClinicId: context.clinic.id,
  });
}

export async function POST(req: Request) {
  const context = await requireClinicPermission("ops.lead_routing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parseRule(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // An assignment rule routes leads *to* a clinic, so it may name one you
  // belong to; an ICP rule is shared and carries none.
  const requested = typeof body?.clinicId === "string" ? body.clinicId : context.clinic.id;
  const allowed = context.memberships.some((m) => m.clinic.id === requested);
  if (parsed.value.kind === "assign" && !allowed) {
    return NextResponse.json({ error: "You do not work at that clinic" }, { status: 403 });
  }

  const [rule] = await db
    .insert(leadRule)
    .values({ ...parsed.value, clinicId: parsed.value.kind === "assign" ? requested : null })
    .returning();
  return NextResponse.json({ rule });
}
