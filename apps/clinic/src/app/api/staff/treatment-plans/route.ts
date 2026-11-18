import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { treatmentPlan, treatmentPlanItem } from "@workspace/db/schema";
import { asc, eq, inArray } from "@workspace/db";
import { isPlanItemKind, isPlanLimbs, planTotals } from "@workspace/db/treatment-plan";
import { requireApiAnyPermission, requireApiPermission } from "@/src/lib/auth/permissions";
import { describeError } from "@/src/lib/api-error";
import { denyPartner } from "@/src/lib/auth/patient-scope";

/**
 * The catalogue of sitting plans — what the clinic sells.
 *
 * A plan is a bill: five or so lines, each with a rate and a quantity, and the
 * net payable is their sum. The Treatment line's quantity is the number of
 * sittings. Both the net and the sitting count are derived from the lines on
 * every save rather than typed in, because a stored total and stored lines
 * disagree the first time somebody edits one and not the other — and the
 * disagreement is invisible until a patient is quoted the wrong number.
 *
 * Reading and editing are separate permissions, for the same reason as the care
 * plan catalogue: anyone enrolling a patient needs the list in front of them,
 * while changing it changes the price of everything sold from tomorrow.
 */
export async function GET(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const session = await requireApiAnyPermission([
    "clinic.treatment_plans",
    "clinic.patients",
    "clinic.appointments",
  ]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The enrolment picker wants only what can still be sold; the settings page
  // wants retired plans too, so one can be brought back.
  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "true";

  const plans = await db
    .select()
    .from(treatmentPlan)
    .where(includeInactive ? undefined : eq(treatmentPlan.isActive, true))
    .orderBy(asc(treatmentPlan.sortOrder), asc(treatmentPlan.name));

  // The lines come with the plans. Without them a list cannot show a price that
  // reconciles, and the editor would have to re-fetch each plan to open it.
  const items = plans.length
    ? await db
        .select()
        .from(treatmentPlanItem)
        .where(
          inArray(
            treatmentPlanItem.planId,
            plans.map((p) => p.id),
          ),
        )
        .orderBy(asc(treatmentPlanItem.sortOrder))
    : [];

  return NextResponse.json({
    plans: plans.map((plan) => ({
      ...plan,
      items: items.filter((i) => i.planId === plan.id),
    })),
  });
}

export interface PlanItemInput {
  kind: string;
  name: string;
  rateInPaise: number;
  quantity: number;
  sortOrder: number;
}

export interface PlanInput {
  name: string;
  limbs: string;
  durationDays: number;
  sittings: number;
  priceInPaise: number;
  advancePercent: number;
  description: string | null;
  sortOrder: number;
  items: PlanItemInput[];
}

/**
 * Validated here rather than at the form, because two consoles and any future
 * import post to the same route.
 *
 * Rupees in, paise out. Money is entered the way it is printed and stored as an
 * integer, because a plan priced by floating point reaches an invoice as
 * 24999.99999.
 */
export function readPlanInput(body: unknown): PlanInput {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) throw new Error("Give the plan a name.");

  const limbs = typeof b.limbs === "string" ? b.limbs : "";
  if (!isPlanLimbs(limbs)) throw new Error("Pick two limbs or four limbs.");

  const durationDays = Number(b.durationDays);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
    throw new Error("Duration must be a whole number of days between 1 and 365.");
  }

  const rawItems = Array.isArray(b.items) ? b.items : [];
  const items: PlanItemInput[] = rawItems.map((raw, index) => {
    const r = (raw ?? {}) as Record<string, unknown>;

    const itemName = typeof r.name === "string" ? r.name.trim() : "";
    if (!itemName) throw new Error(`Line ${index + 1} needs a name.`);

    const kind = typeof r.kind === "string" ? r.kind : "medicine";
    if (!isPlanItemKind(kind)) throw new Error(`Line ${index + 1} must be medicine or treatment.`);

    const rupees = Number(r.rateInRupees ?? 0);
    if (!Number.isFinite(rupees) || rupees < 0) {
      throw new Error(`Line ${index + 1} has a negative rate.`);
    }

    const quantity = Number(r.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`Line ${index + 1} needs a quantity of at least 1.`);
    }

    return {
      kind,
      name: itemName,
      rateInPaise: Math.round(rupees * 100),
      quantity,
      sortOrder: (index + 1) * 10,
    };
  });

  // Exactly one Treatment line. Two of them would make "how many sittings" have
  // two answers, and the schedule can only lay out one of them.
  const treatmentLines = items.filter((i) => i.kind === "treatment");
  if (treatmentLines.length > 1) {
    throw new Error("A plan has one Treatment line — its quantity is the number of sittings.");
  }

  const totals = planTotals(items);
  const sittings = totals.sittings;
  if (items.length && sittings < 1) {
    throw new Error("Add a Treatment line — its quantity is how many sittings the plan includes.");
  }
  if (sittings > durationDays) {
    throw new Error(
      `${sittings} sittings will not fit in ${durationDays} days. Raise the duration or lower the Treatment quantity.`,
    );
  }

  // How much has to be in before the course can start. Zero is legitimate —
  // a clinic that takes nothing up front should not be forced to invent a
  // number — so it is a default, not a requirement.
  const advancePercent = Number(b.advancePercent ?? 0);
  if (!Number.isFinite(advancePercent) || advancePercent < 0 || advancePercent > 100) {
    throw new Error("Advance must be between 0 and 100 percent.");
  }

  const sortOrder = Number(b.sortOrder ?? 0);

  return {
    name,
    limbs,
    durationDays,
    // Derived, both of them. Nothing here is typed in twice.
    sittings: sittings || durationDays,
    priceInPaise: totals.netInPaise,
    advancePercent: Math.round(advancePercent),
    description:
      typeof b.description === "string" && b.description.trim() ? b.description.trim() : null,
    sortOrder: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0,
    items,
  };
}

/**
 * Replace a plan's lines wholesale.
 *
 * Delete-then-insert rather than a per-row diff: the editor hands back the
 * whole table every time, rows have no stable identity in it, and a course
 * already sold keeps its own copy of the lines, so nothing downstream depends
 * on these rows surviving.
 */
export async function savePlanItems(planId: string, items: PlanItemInput[]) {
  await db.transaction(async (tx) => {
    await tx.delete(treatmentPlanItem).where(eq(treatmentPlanItem.planId, planId));
    if (items.length) {
      await tx.insert(treatmentPlanItem).values(items.map((item) => ({ ...item, planId })));
    }
  });
}

export async function POST(req: Request) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const session = await requireApiPermission("clinic.treatment_plans");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { items, ...plan } = readPlanInput(await req.json().catch(() => null));

    const [created] = await db
      .insert(treatmentPlan)
      .values({ ...plan, createdByUserId: session.user.id })
      .returning();

    await savePlanItems(created!.id, items);

    return NextResponse.json({ plan: created }, { status: 201 });
  } catch (error) {
    // A duplicate shape trips the unique index, and "duplicate key value
    // violates constraint treatment_plan_shape_unique" is not something to put
    // in front of whoever is pricing plans.
    const message = describeError(error, "Could not save the plan");
    const friendly = message.includes("treatment_plan_shape_unique")
      ? "A plan with that name and shape already exists."
      : message;
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}
