import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, contact, patientRecord, valdTest } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import type { ValdSideMetrics } from "@workspace/db/vald";
import { localValdProfileId } from "@workspace/db/vald-catalog";
import { getValdTestType } from "@workspace/db/vald-test-types";
import { ensurePatientRecord } from "@workspace/db/patient-registry";
import { valdTestProfile } from "@workspace/db/vald-profile";
import { refreshMuscleAge } from "@workspace/db/muscle-age";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { denyPartner, guardDiagnosis } from "@/src/lib/auth/patient-scope";

const CAN_USE = ["clinic.patients", "clinic.appointments", "clinic.biomarkers"];

/**
 * A DynaMo test run in the clinic, over Bluetooth — from the consultation or
 * the patient's page.
 *
 * POST { test, left, right, device, sampleRateHz, appointmentId?, zeroed? }
 *
 * Everything is ours: the measurement comes straight off the device in the
 * browser, and is stored here against the patient and the visit, with every
 * rep and a trace of the curve. VALD's cloud is not involved — the test id is
 * the patient's own (PRD-<patient code>), and the row id is ours ("predict-…")
 * so a VALD sync, should one ever run, can never collide with it. The region /
 * category / movement names are VALD's, so one history covers both.
 */
interface SideIn {
  peakNewtons?: unknown;
  avgNewtons?: unknown;
  maxRfd?: unknown;
  timeToPeakSeconds?: unknown;
  impulseNewtonSeconds?: unknown;
  romDegrees?: unknown;
  repCount?: unknown;
  trace?: unknown;
  reps?: unknown;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function sideOf(s: SideIn | null | undefined, rom: boolean): ValdSideMetrics | null {
  if (!s) return null;
  const metrics: ValdSideMetrics = {
    peakForceNewtons: rom ? null : num(s.peakNewtons),
    avgForceNewtons: rom ? null : num(s.avgNewtons),
    peakRfdNewtonsPerSecond: rom ? null : num(s.maxRfd),
    timeToPeakForceSeconds: rom ? null : num(s.timeToPeakSeconds),
    impulseNewtonSeconds: rom ? null : num(s.impulseNewtonSeconds),
    rangeOfMotionDegrees: rom ? num(s.romDegrees) : null,
    repCount: num(s.repCount),
  };
  return (rom ? metrics.rangeOfMotionDegrees : metrics.peakForceNewtons) == null ? null : metrics;
}

/** The reps as measured: numbers only, capped. */
function repsOf(v: unknown): Record<string, number>[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 30)
    .map((r) =>
      Object.fromEntries(
        Object.entries((r ?? {}) as Record<string, unknown>).filter(([, x]) => typeof x === "number" && Number.isFinite(x)),
      ) as Record<string, number>,
    );
}

/** Thinned traces only: [seconds, value] pairs, capped, so a row stays small. */
function traceOf(v: unknown): [number, number][] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "number"))
    .slice(0, 800);
}

/**
 * VALD's sign: positive when the right side is stronger, as a share of the
 * stronger side. Matches the asymmetry on tests synced from their cloud.
 */
function asymmetry(left: number | null, right: number | null): number | null {
  if (left == null || right == null) return null;
  const stronger = Math.max(Math.abs(left), Math.abs(right));
  if (stronger <= 0) return null;
  return Math.round(((right - left) / stronger) * 1000) / 10;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const blocked = (await denyPartner()) ?? (await guardDiagnosis(id));
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_USE);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The chart, by chart id or contact id. A person seen at the desk for the
  // first time may have none yet — the test is the moment they need one, so it
  // is made here rather than failing the test they just did.
  const byId = (await db.select().from(patientRecord).where(eq(patientRecord.id, id)).limit(1))[0];
  let chart = byId ?? (await db.select().from(patientRecord).where(eq(patientRecord.contactId, id)).limit(1))[0];
  if (!chart) {
    const [person] = await db.select({ id: contact.id }).from(contact).where(eq(contact.id, id)).limit(1);
    if (!person) return NextResponse.json({ error: "No such patient" }, { status: 404 });
    const made = await ensurePatientRecord(db, person.id);
    if (made) chart = (await db.select().from(patientRecord).where(eq(patientRecord.id, made.patientId)).limit(1))[0];
  }
  if (!chart) return NextResponse.json({ error: "Could not open a chart for this patient." }, { status: 400 });

  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  // The consultation it was run at, when it was run from one — only if that
  // visit is this patient's.
  let appointmentId: string | null = null;
  if (typeof body.appointmentId === "string" && body.appointmentId) {
    const [visit] = await db
      .select({ id: appointment.id, contactId: appointment.contactId })
      .from(appointment)
      .where(eq(appointment.id, body.appointmentId))
      .limit(1);
    if (!visit || visit.contactId !== chart.contactId) {
      return NextResponse.json({ error: "That visit is not this patient's." }, { status: 400 });
    }
    appointmentId = visit.id;
  }
  // The test from our own catalogue (vald_test_type).
  const def = typeof body.test === "string" ? await getValdTestType(db, body.test) : undefined;
  if (!def) return NextResponse.json({ error: "Pick a test" }, { status: 400 });

  // Age and sex at the test — what strength is compared against. From the
  // record when it has them; otherwise as entered at the runner. A date of
  // birth is not needed: the age the patient gives is enough.
  const known = chart.contactId ? await valdTestProfile(db, chart.contactId) : null;
  const p = (body.profile ?? {}) as { age?: unknown; sex?: unknown };
  const enteredAge = Number(p.age);
  const age = Number.isFinite(enteredAge) && enteredAge > 0 && enteredAge < 120 ? Math.round(enteredAge) : known?.age ?? null;
  const sex = p.sex === "Male" || p.sex === "Female" || p.sex === "Other" ? p.sex : known?.sex ?? null;
  if (age == null || !sex) {
    return NextResponse.json({ error: "Enter the patient's age and sex before saving the test." }, { status: 400 });
  }
  // A chart that never had its sex recorded learns it here.
  if (!["MALE", "FEMALE", "OTHER"].includes(chart.gender)) {
    await db
      .update(patientRecord)
      .set({ gender: sex.toUpperCase(), updatedAt: new Date() })
      .where(eq(patientRecord.id, chart.id));
  }
  const profile = {
    age,
    sex,
    ageSource: Number.isFinite(enteredAge) && enteredAge > 0 ? "entered" : known?.ageSource ?? null,
  };

  const rom = def.kind === "rom";
  const left = sideOf(body.left as SideIn | null, rom);
  const right = sideOf(body.right as SideIn | null, rom);
  if (!left && !right) {
    return NextResponse.json({ error: "Nothing was measured on either side." }, { status: 400 });
  }

  const headline = (s: ValdSideMetrics | null) => (rom ? s?.rangeOfMotionDegrees : s?.peakForceNewtons) ?? null;
  const device = (body.device ?? {}) as Record<string, unknown>;
  const now = new Date();

  const row = {
    id: `predict-${randomUUID()}`,
    patientId: chart.id,
    // Our own test id, from the patient code — no VALD account involved.
    valdProfileId: localValdProfileId(chart.patientCode),
    appointmentId,
    testCategory: def.category,
    bodyRegion: def.region,
    movement: def.movement,
    position: def.position,
    // A one-measurement test (neck, trunk) is filed as VALD files it.
    laterality: def.laterality === "None" ? "None" : left && right ? "LeftThenRight" : left ? "LeftSide" : "RightSide",
    testedAt: now,
    durationSeconds: null,
    leftMaxForceNewtons: rom ? null : (left?.peakForceNewtons ?? null),
    rightMaxForceNewtons: rom ? null : (right?.peakForceNewtons ?? null),
    leftRomDegrees: rom ? (left?.rangeOfMotionDegrees ?? null) : null,
    rightRomDegrees: rom ? (right?.rangeOfMotionDegrees ?? null) : null,
    asymmetryPercent: asymmetry(headline(left), headline(right)),
    sides: { left, right },
    raw: {
      source: "predict-clinic",
      test: def.key,
      profile,
      capturedBy: { id: session.user.id, name: session.user.name },
      device: {
        model: typeof device.model === "string" ? device.model.slice(0, 40) : null,
        serial: typeof device.serial === "string" ? device.serial.slice(0, 20) : null,
        firmware: typeof device.firmware === "string" ? device.firmware.slice(0, 60) : null,
      },
      sampleRateHz: num(body.sampleRateHz),
      traces: {
        left: traceOf((body.left as SideIn | null)?.trace),
        right: traceOf((body.right as SideIn | null)?.trace),
      },
      // Every rep, not only the best — what the trend charts and a second
      // look at the test can be worked from later.
      reps: {
        left: repsOf((body.left as SideIn | null)?.reps),
        right: repsOf((body.right as SideIn | null)?.reps),
      },
      zeroedBeforeTest: body.zeroed === true,
    },
    syncedAt: now,
  };

  await db.insert(valdTest).values(row);
  // Muscle age (strength) and share of normal (ROM), kept with the test and
  // with the day — see @workspace/db/muscle-age.
  await refreshMuscleAge(db, chart.id);
  return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
}
