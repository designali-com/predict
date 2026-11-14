import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  biologicalAgeResult,
  biomarker,
  biomarkerIndex,
  biomarkerReading,
  patientRecord,
} from "@workspace/db/schema";
import { asc, desc, eq } from "@workspace/db";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { resolvePatientIndex } from "@workspace/db/patient-index";
import { patientDashboard, type DashboardIndex } from "@workspace/db/patient-dashboard";
import { guardDiagnosis } from "@/src/lib/auth/patient-scope";

const CAN_READ = ["clinic.biomarkers", "clinic.patients", "clinic.appointments"];

/**
 * One patient's blood work over time.
 *
 * Readings are append-only, so "what changed since the last test" is a question
 * about two panels, not about one row that got overwritten. This groups them
 * into the panels they were drawn as and pairs each marker with its previous
 * value, which is the comparison the clinic actually reads these for.
 *
 * The chart is the key. A patient who has never opened the app still has blood
 * work, and it still belongs to them.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await guardDiagnosis((await ctx.params).id);
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_READ);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  // The route is opened by contact id in some places and chart id in others,
  // so accept either rather than returning an empty history for a real patient.
  const [chart] =
    (await db.select().from(patientRecord).where(eq(patientRecord.id, id)).limit(1)) ??
    [];
  const resolved =
    chart ??
    (await db.select().from(patientRecord).where(eq(patientRecord.contactId, id)).limit(1))[0];

  if (!resolved) return NextResponse.json({ panels: [], scores: [], clock: null });

  const [readings, markers, scores, indexes, dashboard] = await Promise.all([
    db
      .select()
      .from(biomarkerReading)
      .where(eq(biomarkerReading.patientId, resolved.id))
      .orderBy(desc(biomarkerReading.recordedAt)),
    db.select().from(biomarker).orderBy(asc(biomarker.name)),
    db
      .select()
      .from(biologicalAgeResult)
      .where(eq(biologicalAgeResult.patientId, resolved.id))
      .orderBy(desc(biologicalAgeResult.createdAt)),
    db.select().from(biomarkerIndex),
    patientDashboard(db, { patientId: resolved.id }),
  ]);

  const markerById = new Map(markers.map((m) => [m.id, m]));

  // A panel is everything drawn on one day. Readings entered before the draw
  // date existed fall back to the day they were typed, so an old upload still
  // groups sensibly instead of scattering into one panel per row.
  const byDay = new Map<string, typeof readings>();
  for (const r of readings) {
    const day = r.collectedOn ?? r.recordedAt.toISOString().slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(r);
    else byDay.set(day, [r]);
  }

  const days = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1));

  const panels = days.map((day, dayIndex) => {
    const rows = byDay.get(day) ?? [];
    // The panel before this one, for the change column.
    const earlier = days.slice(dayIndex + 1);

    return {
      collectedOn: day,
      markers: rows
        .map((r) => {
          const m = markerById.get(r.biomarkerId);
          if (!m) return null;

          let previous: { value: number; collectedOn: string } | null = null;
          for (const olderDay of earlier) {
            const hit = (byDay.get(olderDay) ?? []).find((x) => x.biomarkerId === r.biomarkerId);
            if (hit) {
              previous = { value: hit.value, collectedOn: olderDay };
              break;
            }
          }

          const inRange =
            m.rangeMin != null && m.rangeMax != null
              ? r.value >= m.rangeMin && r.value <= m.rangeMax
              : null;

          return {
            biomarkerId: m.id,
            name: m.name,
            shortCode: m.shortCode,
            unit: m.unit,
            rangeMin: m.rangeMin,
            rangeMax: m.rangeMax,
            /** true = a higher number is the worse direction. */
            direction: m.direction,
            value: r.value,
            inRange,
            previousValue: previous?.value ?? null,
            previousOn: previous?.collectedOn ?? null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (a!.name < b!.name ? -1 : 1)),
    };
  });

  const indexById = new Map(indexes.map((i) => [i.id, i]));

  // Only the index this patient is scored on — the same one their own
  // dashboard shows. Results for other indexes are older history from when
  // every index was calculated on every panel; listing them beside the
  // current one would put two biological ages in front of the clinician and
  // leave them to guess which the patient sees.
  const assigned = await resolvePatientIndex(db, resolved.id);

  return NextResponse.json({
    patientId: resolved.id,
    index: assigned
      ? { ...assigned.index, isDefault: assigned.isDefault }
      : null,
    panels,
    scores: scores.filter((s) => !assigned || s.indexId === assigned.index.id).map((s) => ({
      id: s.id,
      indexShortCode: indexById.get(s.indexId)?.shortCode ?? "",
      indexName: indexById.get(s.indexId)?.name ?? "",
      chronologicalAge: s.chronologicalAge,
      biologicalAge: s.biologicalAge,
      deltaAge: s.deltaAge,
      createdAt: s.createdAt,
    })),
    // The same saved result the patient's own clock is drawn from: biological
    // age, the minute hand (composite score), and each risk domain. Recomputed
    // here it could disagree with what the patient sees the moment a range changes.
    clock: clockFrom(dashboard.indexes[0]),
  });
}

/** What the patient clock reads off this report, without the marker lists. */
function clockFrom(index: DashboardIndex | undefined) {
  if (!index) return null;
  const measured = index.domains.filter((d) => d.measured);
  const top = measured.reduce<(typeof measured)[number] | null>(
    (best, d) => (!best || (d.shareOfDelta ?? 0) > (best.shareOfDelta ?? 0) ? d : best),
    null,
  );
  const domain = (d: DashboardIndex["domains"][number]) => ({
    shortCode: d.shortCode,
    name: d.name,
    measured: d.measured,
    share: d.shareOfDelta,
    band: d.band?.label ?? null,
    severity: d.severity,
    meanAbsZ: d.meanAbsZ,
    contribution: d.contribution,
  });
  return {
    biologicalAge: index.biologicalAge,
    chronologicalAge: index.chronologicalAge,
    deltaAge: index.deltaAge,
    compositeScore: index.compositeScore,
    band: index.band?.label ?? null,
    calculatedAt: index.calculatedAt,
    measuredDomains: index.measuredDomains,
    mappedDomains: index.mappedDomains,
    topDomain: top ? domain(top) : null,
    domains: index.domains.map(domain),
  };
}
