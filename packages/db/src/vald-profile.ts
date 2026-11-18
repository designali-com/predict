import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { clinicalFormSubmission, contact, patientRecord, valdTest } from "./schema";
import type * as schema from "./schema";
import { ageFromDob } from "./form-scoring";
import { STUB_DATE_OF_BIRTH } from "./registration-sync";
import { localValdProfileId } from "./vald-catalog";

type Db = NodePgDatabase<typeof schema>;

export type ValdSexLabel = "Male" | "Female" | "Other";

/**
 * Who a DynaMo test is for, as the test needs them: an id, a name, an age and
 * a sex — age and sex being what strength is compared against.
 *
 * There is no VALD account behind this. The test id comes from the patient
 * code, and the age comes from wherever the clinic has it: the date of birth
 * when there is one; otherwise the age the desk wrote on the registration
 * form; otherwise the age entered at an earlier test, carried forward by the
 * time since. A date of birth is not required — most walk-ins only say how old
 * they are.
 */
export interface ValdTestProfile {
  /** PRD-<patient code>; null until the patient has a chart. */
  testId: string | null;
  name: string | null;
  age: number | null;
  ageSource: "dob" | "registration" | "test" | null;
  sex: ValdSexLabel | null;
}

const sexFromGender = (g: string | null | undefined): ValdSexLabel | null =>
  ({ MALE: "Male", FEMALE: "Female", OTHER: "Other" })[(g ?? "").toUpperCase()] as ValdSexLabel | undefined ?? null;

const sexFromAnswer = (s: unknown): ValdSexLabel | null =>
  s === "Male" ? "Male" : s === "Female" ? "Female" : s === "LGBTQ+" || s === "Other" ? "Other" : null;

export async function valdTestProfile(db: Db, contactId: string): Promise<ValdTestProfile> {
  const [person] = await db.select({ name: contact.name }).from(contact).where(eq(contact.id, contactId)).limit(1);
  const [chart] = await db.select().from(patientRecord).where(eq(patientRecord.contactId, contactId)).limit(1);
  const [registration] = await db
    .select({ answers: clinicalFormSubmission.answers })
    .from(clinicalFormSubmission)
    .where(and(eq(clinicalFormSubmission.contactId, contactId), eq(clinicalFormSubmission.formKey, "registration_front_desk")))
    .orderBy(desc(clinicalFormSubmission.updatedAt))
    .limit(1);
  const answers = (registration?.answers ?? {}) as Record<string, unknown>;

  let age: number | null = null;
  let ageSource: ValdTestProfile["ageSource"] = null;
  if (chart?.dateOfBirth && chart.dateOfBirth !== STUB_DATE_OF_BIRTH) {
    age = ageFromDob(chart.dateOfBirth);
    if (age != null) ageSource = "dob";
  }
  if (age == null) {
    const written = Number(answers.age);
    if (Number.isFinite(written) && written > 0 && written < 120) {
      age = Math.round(written);
      ageSource = "registration";
    }
  }
  if (age == null && chart) {
    const recent = await db
      .select({ raw: valdTest.raw, testedAt: valdTest.testedAt })
      .from(valdTest)
      .where(and(eq(valdTest.patientId, chart.id), isNotNull(valdTest.raw)))
      .orderBy(desc(valdTest.testedAt))
      .limit(20);
    const ageOf = (r: (typeof recent)[number]) => Number((r.raw as { profile?: { age?: unknown } } | null)?.profile?.age);
    const last = recent.find((r) => Number.isFinite(ageOf(r)) && ageOf(r) > 0);
    const given = last ? ageOf(last) : NaN;
    if (last && given > 0) {
      const years = Math.floor((Date.now() - last.testedAt.getTime()) / (365.25 * 86_400_000));
      age = given + Math.max(0, years);
      ageSource = "test";
    }
  }

  return {
    testId: chart ? localValdProfileId(chart.patientCode) : null,
    name: person?.name ?? (chart ? [chart.firstName, chart.lastName].filter(Boolean).join(" ") : null),
    age,
    ageSource,
    sex: sexFromGender(chart?.gender) ?? sexFromAnswer(answers.sex),
  };
}
