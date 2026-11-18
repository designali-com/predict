import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";
import { eventLead } from "./schema";
import type * as schema from "./schema";
import { assessGrip, newtonsToKg, type Sex } from "./grip-norms";

type Database = NodePgDatabase<typeof schema>;

/**
 * People who walked up to a stall.
 *
 * The whole design turns on one constraint: nobody is going to create an
 * account at an event. So identity has to be something they carry away in ten
 * seconds, and the result has to be reachable weeks later by a stranger who has
 * forgotten everything except their own phone number.
 */

/**
 * The code a person reads off a screen.
 *
 * No 0/O, no 1/I/L — those are the characters people mis-copy, and a wrong
 * character here means a person cannot find their own result. Six characters
 * from a 30-letter alphabet is about 729 million combinations, but that is not
 * what protects it: retrieval also demands the phone number, because a code
 * short enough to read aloud is short enough to guess at scale.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/**
 * The token in the share URL.
 *
 * Long and random because it is the only thing standing between a link and
 * somebody's name and result. 32 hex characters is 128 bits — not guessable,
 * which is what lets the page be public and therefore shareable.
 */
function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Digits only, so a number typed with spaces still matches the one stored. */
export function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export interface CreateLeadParams {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  ageYears: number;
  /** How they identify. "other" reaches VALD as Unknown. */
  sex: Sex | "other";
  /**
   * Which curve to score against. Defaults to `sex` when that is male or
   * female; left null for "other" unless they chose one.
   */
  normReference?: Sex | null;
  eventName?: string | null;
}

export async function createEventLead(db: Database, params: CreateLeadParams) {
  // Two fields, taken as given. The kiosk used to accept one box and split it
  // on whitespace, which invented a surname for anybody with one name and cut
  // two-word first names in half — and the surname is what the DynaMo app
  // sorts its list by, so a wrong one made a person unfindable.
  const firstName = params.firstName.trim();
  const lastName = params.lastName.trim();
  const name = `${firstName} ${lastName}`.trim();
  const phone = normalisePhone(params.phone);

  if (firstName.length < 2) throw new Error("Enter a first name.");
  if (lastName.length < 1) throw new Error("Enter a last name.");
  if (phone.length !== 10) throw new Error("Enter a 10-digit mobile number.");
  if (!Number.isFinite(params.ageYears) || params.ageYears < 12 || params.ageYears > 100) {
    throw new Error("Enter an age between 12 and 100.");
  }
  if (!["male", "female", "other"].includes(params.sex)) {
    throw new Error("Choose an option.");
  }

  // The reference follows the answer when there is one to follow, and is only
  // ever male or female because those are the only curves that exist.
  const normReference =
    params.sex === "male" || params.sex === "female"
      ? params.sex
      : params.normReference === "male" || params.normReference === "female"
        ? params.normReference
        : null;

  // Retried rather than trusted: a collision is astronomically unlikely but a
  // unique index would otherwise turn one into a failed signup in front of a
  // queue of people.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [created] = await db
        .insert(eventLead)
        .values({
          firstName,
          lastName,
          name,
          phone,
          email: params.email?.trim() || null,
          ageYears: Math.round(params.ageYears),
          sex: params.sex,
          normReference,
          claimCode: randomCode(),
          shareToken: randomToken(),
          eventName: params.eventName?.trim() || null,
        })
        .returning();
      return created!;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("claim_code") && !message.includes("share_token")) throw error;
    }
  }
  throw new Error("Could not allocate a code. Try again.");
}

/** By share token: the public link. */
export async function leadByToken(db: Database, token: string) {
  const [row] = await db
    .select()
    .from(eventLead)
    .where(eq(eventLead.shareToken, token))
    .limit(1);
  return row ?? null;
}

/**
 * By code and phone together.
 *
 * Both are required. The code alone is short enough to enumerate, and the phone
 * alone would let anybody who knows a person's number read their result.
 */
export async function leadByCodeAndPhone(db: Database, code: string, phone: string) {
  const [row] = await db
    .select()
    .from(eventLead)
    .where(
      and(
        eq(eventLead.claimCode, code.trim().toUpperCase()),
        eq(eventLead.phone, normalisePhone(phone)),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The stall's own view: who came through, newest first. */
export async function recentLeads(db: Database, limit = 100) {
  return db.select().from(eventLead).orderBy(desc(eventLead.createdAt)).limit(limit);
}

export interface RecordTestParams {
  leadId: string;
  testId: string;
  testedAt: Date;
  peakLeftNewtons: number | null;
  peakRightNewtons: number | null;
  asymmetryPercent: number | null;
  forceTrace?: { timeSeconds: number; forceNewtons: number }[] | null;
  raw?: unknown;
}

/**
 * File the test and work out what it means.
 *
 * The assessment is computed once and stored rather than derived on each page
 * load. A link somebody shared has to keep saying the same thing — editing the
 * norm table next month must not silently change a result already sent to a
 * friend.
 */
export async function recordEventTest(db: Database, params: RecordTestParams) {
  const [lead] = await db.select().from(eventLead).where(eq(eventLead.id, params.leadId)).limit(1);
  if (!lead) throw new Error("No such entry.");

  const peaks = [params.peakLeftNewtons, params.peakRightNewtons].filter(
    (v): v is number => v != null && v > 0,
  );
  // The reference curve describes the stronger hand, so that is what is scored.
  const strongestNewtons = peaks.length ? Math.max(...peaks) : null;

  // Scored against the reference curve, never against the identity. Somebody
  // who answered "other" and chose no reference gets their measurement, their
  // balance and their force curve — but no muscle age, because there is no
  // third curve and inventing one would be worse than leaving it out.
  const reference = lead.normReference as Sex | null;

  const assessment =
    strongestNewtons && reference
      ? assessGrip({
          peakKg: newtonsToKg(strongestNewtons),
          ageYears: lead.ageYears,
          sex: reference,
        })
      : null;

  const [updated] = await db
    .update(eventLead)
    .set({
      testId: params.testId,
      testedAt: params.testedAt,
      peakLeftNewtons: params.peakLeftNewtons,
      peakRightNewtons: params.peakRightNewtons,
      asymmetryPercent: params.asymmetryPercent,
      gripAgeYears: assessment?.gripAgeYears ?? null,
      percentile: assessment?.percentile ?? null,
      // Downsampled by the caller: the raw curve is 6,000 points and nobody
      // needs that many to see the shape of a squeeze.
      forceTrace: params.forceTrace ?? null,
      raw: (params.raw as Record<string, unknown>) ?? null,
      updatedAt: new Date(),
    })
    .where(eq(eventLead.id, params.leadId))
    .returning();

  return { lead: updated!, assessment };
}

/**
 * Thin the force curve for the browser.
 *
 * VALD samples at 225 Hz, so a ten-second squeeze is well over two thousand
 * points — more than a phone should parse and far more than a line 700 pixels
 * wide can show. Peaks are preserved by taking the largest value in each
 * bucket rather than the first, so the top of the curve stays where it was.
 */
export function thinTrace(
  trace: { timeSeconds: number; forceNewtons: number }[],
  target = 220,
): { timeSeconds: number; forceNewtons: number }[] {
  if (trace.length <= target) return trace;
  const bucket = Math.ceil(trace.length / target);
  const out: { timeSeconds: number; forceNewtons: number }[] = [];
  for (let i = 0; i < trace.length; i += bucket) {
    const slice = trace.slice(i, i + bucket);
    let best = slice[0]!;
    for (const point of slice) if (point.forceNewtons > best.forceNewtons) best = point;
    out.push(best);
  }
  return out;
}
