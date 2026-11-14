import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { planEnrollment, treatmentPlan } from "@workspace/db/schema";
import { eq, sql } from "@workspace/db";
import { requireApiPermission } from "@/src/lib/auth/permissions";
import { describeError } from "@/src/lib/api-error";
import { readPlanInput, savePlanItems } from "../route";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiPermission("clinic.treatment_plans");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  try {
    // Retiring is a one-field change and must not have to re-post the whole
    // plan — a settings page that made you re-enter the price to hide a plan
    // would eventually get the price wrong.
    if (body && typeof body.isActive === "boolean" && Object.keys(body).length === 1) {
      const [updated] = await db
        .update(treatmentPlan)
        .set({ isActive: body.isActive, updatedAt: new Date() })
        .where(eq(treatmentPlan.id, id))
        .returning();
      if (!updated) return NextResponse.json({ error: "That plan no longer exists." }, { status: 404 });
      return NextResponse.json({ plan: updated });
    }

    const { items, ...input } = readPlanInput(body);

    // Editing the shape of a plan cannot reach back into courses already sold
    // — every enrolment carries its own snapshot — so this is safe to allow.
    const [updated] = await db
      .update(treatmentPlan)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(treatmentPlan.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: "That plan no longer exists." }, { status: 404 });

    await savePlanItems(updated.id, items);

    return NextResponse.json({ plan: updated });
  } catch (error) {
    const message = describeError(error, "Could not save the plan");
    const friendly = message.includes("treatment_plan_shape_unique")
      ? "A plan with that name and shape already exists."
      : message;
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}

/**
 * Deleting is refused once a plan has been sold.
 *
 * The enrolment would survive it — the foreign key is SET NULL and every
 * enrolment snapshots what it bought — but the link back to the catalogue is
 * how "how many people are on the 42-day four-limb course" gets answered, and
 * a deleted plan makes that unanswerable forever. Retiring does everything
 * deleting was wanted for.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiPermission("clinic.treatment_plans");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(planEnrollment)
    .where(eq(planEnrollment.treatmentPlanId, id));

  const sold = row?.count ?? 0;
  if (sold > 0) {
    return NextResponse.json(
      {
        error: `${sold} ${sold === 1 ? "patient has" : "patients have"} been sold this plan. Retire it instead — it will stop appearing in the picker and their courses stay intact.`,
      },
      { status: 409 },
    );
  }

  await db.delete(treatmentPlan).where(eq(treatmentPlan.id, id));
  return NextResponse.json({ ok: true });
}
