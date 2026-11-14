import { db } from "@workspace/db/client";
import { contact, patientRecord, valdTest } from "@workspace/db/schema";
import { and, asc, eq, gte, lte } from "@workspace/db";
import { clinicLetterhead, missingProfileFields } from "@workspace/db/receipt";
import { isGenderKnown, STUB_DATE_OF_BIRTH } from "@workspace/db/registration-sync";
import { sidesForRow, type ValdSideMetrics } from "@workspace/db/vald";
import { MUSCLE_AGE_DISCLAIMER, muscleAgeHistory } from "@workspace/db/muscle-age";

export type ReportRange = "day" | "week" | "all";

export interface ReportTest {
  id: string;
  testCategory: string | null;
  bodyRegion: string | null;
  movement: string | null;
  position: string | null;
  testedAt: string;
  asymmetryPercent: number | null;
  left: ValdSideMetrics | null;
  right: ValdSideMetrics | null;
  /** Strength tests with a reference: the age this result is average for. */
  muscleAge: number | null;
  strengthPercentile: number | null;
  /** ROM tests: share of the normal range, %. */
  romPercentOfNormal: number | null;
}

export interface ReportGroup {
  key: string;
  title: string;
  category: string;
  tests: ReportTest[];
}

/** Clinic timezone, fixed. The clinic does not move. */
const OFFSET_MINUTES = 330;

function clinicDay(at: Date): string {
  return new Date(at.getTime() + OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** Start of a clinic day, as an instant. */
function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00+05:30`);
}

function dayEnd(day: string): Date {
  return new Date(`${day}T23:59:59.999+05:30`);
}

function ageOn(dateOfBirth: string | null): number | null {
  if (!dateOfBirth || dateOfBirth === STUB_DATE_OF_BIRTH) return null;
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const had =
    now.getMonth() > dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!had) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * A muscle strength report for one patient, over a window.
 *
 * Assembled here rather than in the page so the window arithmetic sits in one
 * place: "this week" on a report handed to a patient has to mean the same thing
 * every time it is printed.
 */
export async function valdReport({
  patientId,
  range,
  day,
}: {
  patientId: string;
  range: ReportRange;
  /** The day the window is anchored on. Defaults to the last test. */
  day?: string;
}) {
  const [chart] = await db
    .select()
    .from(patientRecord)
    .where(eq(patientRecord.id, patientId))
    .limit(1);
  if (!chart) return null;

  const person = chart.contactId
    ? (await db.select().from(contact).where(eq(contact.id, chart.contactId)).limit(1))[0]
    : undefined;

  const all = await db
    .select()
    .from(valdTest)
    .where(eq(valdTest.patientId, chart.id))
    .orderBy(asc(valdTest.testedAt));

  // Anchored on the last test rather than on today, because a report is usually
  // printed after the visit, sometimes the next morning — anchoring on today
  // would hand the patient an empty page.
  const anchor = day ?? (all.length ? clinicDay(all[all.length - 1]!.testedAt) : clinicDay(new Date()));

  let from: Date | null = null;
  let to: Date | null = null;
  if (range === "day") {
    from = dayStart(anchor);
    to = dayEnd(anchor);
  } else if (range === "week") {
    // The seven days ending on the anchor, inclusive.
    const start = new Date(dayStart(anchor).getTime() - 6 * 24 * 60 * 60 * 1000);
    from = start;
    to = dayEnd(anchor);
  }

  const rows =
    from && to
      ? await db
          .select()
          .from(valdTest)
          .where(
            and(
              eq(valdTest.patientId, chart.id),
              gte(valdTest.testedAt, from),
              lte(valdTest.testedAt, to),
            ),
          )
          .orderBy(asc(valdTest.testedAt))
      : all;

  const tests: ReportTest[] = rows.map((r) => {
    const sides = sidesForRow(r);
    return {
      id: r.id,
      testCategory: r.testCategory,
      bodyRegion: r.bodyRegion,
      movement: r.movement,
      position: r.position,
      testedAt: r.testedAt.toISOString(),
      asymmetryPercent: r.asymmetryPercent,
      left: sides?.left ?? null,
      right: sides?.right ?? null,
      muscleAge: r.muscleAge,
      strengthPercentile: r.strengthPercentile,
      romPercentOfNormal: r.romPercentOfNormal,
    };
  });

  const groups = new Map<string, ReportGroup>();
  for (const t of tests) {
    // ROM and strength of one movement, or one movement in two positions, are
    // separate tests — grouped together, the second simply vanished.
    const key = `${t.testCategory}|${t.bodyRegion}|${t.movement}|${t.position}`;
    const where = t.position && t.position !== "Neutral" ? ` · ${spaced(t.position).toLowerCase()}` : "";
    const title = `${spaced(t.bodyRegion)} ${spaced(t.movement).toLowerCase()}${where}`.trim();
    const found = groups.get(key);
    if (found) found.tests.push(t);
    else groups.set(key, { key, title, category: t.testCategory ?? "", tests: [t] });
  }

  const asymmetries = tests
    .map((t) => t.asymmetryPercent)
    .filter((v): v is number => v != null)
    .map(Math.abs);

  const clinic = await clinicLetterhead(db, person?.clinicId);

  // Muscle age: the latest visit in the window, and the visits before it for
  // the trend. Worked out and stored when each test was saved.
  const history = await muscleAgeHistory(db, chart.id, anchor);
  const inWindow = history.filter((h) => !from || (h.day >= clinicDay(from) && h.day <= anchor));
  const latest = inWindow[inWindow.length - 1] ?? null;
  const previous = latest ? [...history].reverse().find((h) => h.day < latest.day) ?? null : null;

  const name = [chart.firstName, chart.middleName, chart.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    clinic,
    missing: missingProfileFields(clinic),
    /** What the patient page is keyed on, for the link back. */
    patientId: chart.contactId ?? chart.id,
    patient: {
      name: name || person?.name || "Patient",
      code: chart.patientCode,
      age: ageOn(chart.dateOfBirth),
      sex: isGenderKnown(chart.gender) ? chart.gender.toLowerCase() : null,
      phone: chart.mobileNumber ?? person?.phone ?? null,
    },
    range,
    // The window as clinic days, not instants. Printing an instant meant a
    // single session came out as "26 August to 27 August", because midnight in
    // Delhi is the previous evening in UTC and the header compared the two
    // dates after they had already been shifted.
    fromDay: from ? clinicDay(from) : tests[0] ? clinicDay(new Date(tests[0].testedAt)) : null,
    toDay: to
      ? clinicDay(to)
      : tests.length
        ? clinicDay(new Date(tests[tests.length - 1]!.testedAt))
        : null,
    generatedAt: new Date().toISOString(),
    summary: {
      testCount: tests.length,
      movementCount: groups.size,
      sessionDays: new Set(tests.map((t) => clinicDay(new Date(t.testedAt)))).size,
      averageAsymmetry: asymmetries.length
        ? asymmetries.reduce((a, b) => a + b, 0) / asymmetries.length
        : null,
      worstAsymmetry: asymmetries.length ? Math.max(...asymmetries) : null,
    },
    groups: [...groups.values()],
    muscle: latest
      ? {
          day: latest.day,
          actualAge: latest.actualAge,
          muscleAge: latest.muscleAge,
          gripMuscleAge: latest.gripMuscleAge,
          gripPercentile: latest.gripPercentile,
          testsUsed: Array.isArray(latest.tests) ? latest.tests.length : 0,
          previous: previous ? { day: previous.day, muscleAge: previous.muscleAge } : null,
          disclaimer: MUSCLE_AGE_DISCLAIMER,
        }
      : null,
    /** Whether anything at all exists outside this window, for the empty case. */
    totalOnRecord: all.length,
  };
}

function spaced(value: string | null): string {
  if (!value) return "";
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export type ValdReport = NonNullable<Awaited<ReturnType<typeof valdReport>>>;
