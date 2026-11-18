import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { isSuperadmin } from "@workspace/db/clinic-service";
import {
  byDimension,
  clinicComparison,
  funnel,
  teamPerformance,
  unclaimedLeads,
} from "@workspace/db/reports";
import { requireClinicPermission } from "@/src/lib/auth/clinic";

/**
 * The numbers for one clinic over one period — and, for a superadmin, every
 * clinic side by side.
 *
 * Deliberately one endpoint: the funnel, the source breakdown and the team
 * table are read together on one screen, and splitting them into three calls
 * only invites three different date ranges.
 */
export async function GET(req: Request) {
  const context = await requireClinicPermission("ops.reports");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to.getTime() - days * 86_400_000);
  from.setHours(0, 0, 0, 0);

  // "All clinics" is a superadmin view. Anyone else gets the clinic they are
  // standing in, whatever the query string asks for.
  const wantsAll = url.searchParams.get("scope") === "all" && isSuperadmin(context.session.user.role);
  const range = { from, to, clinicId: wantsAll ? null : context.clinic.id };

  const [headline, sources, icps, cities, team] = await Promise.all([
    funnel(db, range),
    byDimension(db, "source", range),
    byDimension(db, "icp", range),
    byDimension(db, "city", range),
    teamPerformance(db, range),
  ]);

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString(), days },
    scope: wantsAll ? "all" : "clinic",
    clinic: { id: context.clinic.id, name: context.clinic.name },
    canSeeAllClinics: isSuperadmin(context.session.user.role),
    funnel: headline,
    sources,
    icps,
    cities,
    team,
    // Only meaningful to somebody who can act on it across clinics.
    ...(isSuperadmin(context.session.user.role)
      ? {
          clinics: await clinicComparison(db, { from, to }),
          unclaimed: await unclaimedLeads(db, { from, to }),
        }
      : {}),
  });
}
