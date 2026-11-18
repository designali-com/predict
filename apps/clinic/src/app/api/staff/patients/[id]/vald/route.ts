import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { patientRecord, valdTest } from "@workspace/db/schema";
import { desc, eq } from "@workspace/db";
import { sidesForRow } from "@workspace/db/vald";
import { localValdProfileId } from "@workspace/db/vald-catalog";
import { valdTestProfile } from "@workspace/db/vald-profile";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { guardDiagnosis } from "@/src/lib/auth/patient-scope";

const CAN_USE = ["clinic.patients", "clinic.appointments", "clinic.biomarkers"];

async function chartFor(id: string) {
  const [byId] = await db.select().from(patientRecord).where(eq(patientRecord.id, id)).limit(1);
  if (byId) return byId;
  const [byContact] = await db
    .select()
    .from(patientRecord)
    .where(eq(patientRecord.contactId, id))
    .limit(1);
  return byContact ?? null;
}

/**
 * One patient's DynaMo tests, from our own database — those run here over
 * Bluetooth and those imported once from VALD's cloud.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await guardDiagnosis((await ctx.params).id);
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_USE);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const chart = await chartFor(id);
  // Somebody at their first visit has no chart until the first test makes one.
  // That is an empty history, not a missing patient — and their profile still
  // reads from what the desk has (name, the age on the registration form).
  if (!chart) {
    return NextResponse.json({
      patientId: null,
      testProfileId: null,
      profile: await valdTestProfile(db, id),
      tests: [],
    });
  }

  const tests = await db
    .select()
    .from(valdTest)
    .where(eq(valdTest.patientId, chart.id))
    .orderBy(desc(valdTest.testedAt));

  return NextResponse.json({
    patientId: chart.id,
    // The patient's own test id for tests run here over Bluetooth.
    testProfileId: localValdProfileId(chart.patientCode),
    profile: chart.contactId ? await valdTestProfile(db, chart.contactId) : null,
    tests: tests.map((t) => ({
      id: t.id,
      testCategory: t.testCategory,
      bodyRegion: t.bodyRegion,
      movement: t.movement,
      position: t.position,
      laterality: t.laterality,
      appointmentId: t.appointmentId,
      testedAt: t.testedAt,
      leftMaxForceNewtons: t.leftMaxForceNewtons,
      rightMaxForceNewtons: t.rightMaxForceNewtons,
      leftRomDegrees: t.leftRomDegrees,
      rightRomDegrees: t.rightRomDegrees,
      asymmetryPercent: t.asymmetryPercent,
      sides: sidesForRow(t),
      muscleAge: t.muscleAge,
      strengthPercentile: t.strengthPercentile,
      romPercentOfNormal: t.romPercentOfNormal,
    })),
  });
}
