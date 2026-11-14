// The piece of paper the patient walks away with.
//
// A payment row is the clinic's record; a receipt is the patient's. They are
// the same event and must never be two sources — so a receipt is not composed
// at print time from whatever is on screen, it is read back out of the payment
// that was recorded, by its number.
//
// The number is stored, not derived. A number computed from a row's position
// would renumber every receipt after one that gets voided — including the ones
// already printed and handed over — and two patients would be holding the same
// number.

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  appointment,
  clinic,
  clinicProfile,
  contact,
  patientRecord,
  payment,
  planEnrollment,
  user,
} from "./schema";
import type * as schema from "./schema";
import { PAYMENT_KINDS, PAYMENT_METHODS } from "./payment";

type Database = NodePgDatabase<typeof schema>;

/** The one row. Created by the migration; read on every receipt. */
export const CLINIC_PROFILE_ID = "default";

export type ClinicProfile = typeof clinicProfile.$inferSelect;

export async function getClinicProfile(db: Database): Promise<ClinicProfile> {
  const [row] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.id, CLINIC_PROFILE_ID))
    .limit(1);

  if (row) return row;

  // The migration seeds this, so reaching here means a fresh database that has
  // not been migrated. Better to create it than to render a nameless receipt.
  const [created] = await db
    .insert(clinicProfile)
    .values({ id: CLINIC_PROFILE_ID, name: "OPTM" })
    .returning();
  return created!;
}

/** Which of the printable details are still blank. */
/** The letterhead: a clinic's details as receipts, forms and reports print them. */
/** iconUrl: the clinic's round mark, set beside its name on a printed bill. */
export type Letterhead = ClinicProfile & { logoUrl: string | null; iconUrl: string | null; shortName: string | null };

/**
 * The letterhead of one clinic — its name, address, logo and wording. Falls
 * back to the old single profile for a row that has no clinic.
 */
export async function clinicLetterhead(db: Database, clinicId?: string | null): Promise<Letterhead> {
  const [row] = clinicId ? await db.select().from(clinic).where(eq(clinic.id, clinicId)).limit(1) : [];
  if (!row) return { ...(await getClinicProfile(db)), logoUrl: null, iconUrl: null, shortName: null };
  return {
    id: row.id,
    name: row.name,
    legalName: row.legalName,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    phone: row.phone,
    email: row.email,
    website: row.website,
    gstin: row.gstin,
    registrationNo: row.registrationNo,
    footerNote: row.footerNote,
    consentText: row.consentText,
    updatedAt: row.updatedAt,
    logoUrl: row.logoUrl,
    iconUrl: row.iconUrl,
    shortName: row.shortName,
  };
}

export function missingProfileFields(profile: ClinicProfile): string[] {
  const wanted: [keyof ClinicProfile, string][] = [
    ["addressLine1", "address"],
    ["city", "city"],
    ["state", "state"],
    ["pincode", "PIN code"],
    ["phone", "phone"],
  ];
  return wanted.filter(([key]) => !String(profile[key] ?? "").trim()).map(([, label]) => label);
}

/**
 * The Indian financial year a date falls in: April to March, as "26-27".
 *
 * Receipts are numbered per financial year because that is the unit everything
 * downstream — the books, the return, the auditor — counts in.
 */
export function financialYearOf(date: Date): string {
  // Read in the clinic's own zone, so a payment taken at 11pm on 31 March does
  // not fall into next year because UTC has already rolled over.
  const local = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth(); // 0 = January
  const startYear = month >= 3 ? year : year - 1;
  return `${String(startYear % 100).padStart(2, "0")}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function formatReceiptNo(prefix: string, financialYear: string, n: number): string {
  return `${prefix}/${financialYear}/${String(n).padStart(5, "0")}`;
}

/**
 * The next number in the book, taken atomically.
 *
 * One statement, so two people taking money at the same moment cannot be given
 * the same number — the row is locked by the update itself rather than by a
 * read-then-write that has a gap in the middle.
 */
export async function nextReceiptNo(db: Database, at: Date, clinicId?: string | null): Promise<string> {
  const fy = financialYearOf(at);

  // Each clinic counts its own book, under its own prefix. A payment with no
  // clinic falls to our first clinic. Never below the highest number already
  // printed under that prefix: a number handed out by the old single counter
  // (or typed in) is not given out twice.
  const result = await db.execute<{ last_number: number; prefix: string }>(sql`
    with c as (
      select id, receipt_prefix from clinic
      where id = coalesce(${clinicId ?? null}, (select id from clinic where kind = 'clinic' order by created_at limit 1))
    ),
    seen as (
      select coalesce(max((regexp_match(p.receipt_no, '/([0-9]+)$'))[1]::int), 0) as n
      from payment p, c
      where p.receipt_no like c.receipt_prefix || '/' || ${fy} || '/%'
    )
    insert into clinic_receipt_counter (clinic_id, financial_year, last_number)
    select c.id, ${fy}, seen.n + 1 from c, seen
    on conflict (clinic_id, financial_year)
      do update set last_number = greatest(clinic_receipt_counter.last_number, excluded.last_number - 1) + 1
    returning last_number, (select receipt_prefix from c) as prefix
  `);

  const row = result.rows[0];
  if (!row) throw new Error("No clinic to number this receipt for.");
  return formatReceiptNo(row.prefix, fy, Number(row.last_number));
}

/**
 * Payments that belong to this clinic's books.
 *
 * Stamped rows by their own clinic. A row from before payments carried one
 * goes by the patient's clinic — and, when `unplaced` (any clinic but a
 * partner), also a patient no clinic has claimed yet, the same rule the
 * patient pages follow.
 */
export function paymentInClinic(clinicId: string, unplaced = true): SQL {
  return or(
    eq(payment.clinicId, clinicId),
    and(
      isNull(payment.clinicId),
      unplaced
        ? sql`exists (select 1 from "contact" where "id" = ${payment.contactId} and ("clinic_id" = ${clinicId} or "clinic_id" is null))`
        : sql`exists (select 1 from "contact" where "id" = ${payment.contactId} and "clinic_id" = ${clinicId})`,
    ),
  )!;
}

export interface ReceiptLine {
  label: string;
  detail: string | null;
  amountInPaise: number;
}

export interface Receipt {
  receiptNo: string;
  collectedAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  clinic: Letterhead;
  /** What is still blank on the clinic's own details, for the on-screen nudge. */
  missing: string[];
  patient: {
    name: string;
    phone: string | null;
    email: string | null;
    patientCode: string | null;
    contactId: string;
  };
  /** What this money settles, in words the patient would recognise. */
  lines: ReceiptLine[];
  amountInPaise: number;
  method: string;
  methodLabel: string;
  reference: string | null;
  note: string | null;
  kind: string;
  kindLabel: string;
  collectedBy: string | null;
  /** The visit this settles, when it settles one. */
  visitAt: Date | null;
}

/**
 * One receipt, read back from the payment it belongs to.
 *
 * Everything printed comes from stored rows — the amount, the number, who took
 * it, when. Nothing is recomputed from today's prices, because a receipt is a
 * record of what happened, not a quote for what it would cost now.
 *
 * With a clinic, only that clinic's payment — a receipt id typed into another
 * clinic's browser reads as no such payment. See paymentInClinic.
 */
export async function receiptFor(
  db: Database,
  paymentId: string,
  scope?: { clinicId: string; unplaced?: boolean },
): Promise<Receipt | null> {
  const [row] = await db
    .select({
      payment,
      contactName: contact.name,
      contactPhone: contact.phone,
      contactEmail: contact.email,
      contactClinicId: contact.clinicId,
      collectedBy: user.name,
    })
    .from(payment)
    .innerJoin(contact, eq(contact.id, payment.contactId))
    .leftJoin(user, eq(user.id, payment.collectedByUserId))
    .where(
      scope
        ? and(eq(payment.id, paymentId), paymentInClinic(scope.clinicId, scope.unplaced))
        : eq(payment.id, paymentId),
    )
    .limit(1);

  if (!row) return null;
  const p = row.payment;

  const [profile, chart] = await Promise.all([
    // The clinic that took the money prints the receipt.
    clinicLetterhead(db, p.clinicId ?? row.contactClinicId),
    db
      .select({ code: patientRecord.patientCode })
      .from(patientRecord)
      .where(eq(patientRecord.contactId, p.contactId))
      .limit(1),
  ]);

  const lines: ReceiptLine[] = [];
  let visitAt: Date | null = null;

  // Medicine is billed against the visit, but it is not the consultation fee.
  // Checking the kind first is what stops a counter sale printing as one.
  if (p.kind === "medicine") {
    lines.push({
      label: "Medicine",
      detail: p.note,
      amountInPaise: p.amountInPaise,
    });
  } else if (p.appointmentId) {
    const [visit] = await db
      .select()
      .from(appointment)
      .where(eq(appointment.id, p.appointmentId))
      .limit(1);

    visitAt = visit?.scheduledAt ?? null;
    lines.push({
      label: "Consultation fee",
      detail: visit
        ? visit.scheduledAt.toLocaleString("en-IN", {
            timeZone: "Asia/Calcutta",
            dateStyle: "medium",
            timeStyle: "short",
          })
        : null,
      amountInPaise: p.amountInPaise,
    });
  }

  if (p.enrollmentId) {
    const [course] = await db
      .select()
      .from(planEnrollment)
      .where(eq(planEnrollment.id, p.enrollmentId))
      .limit(1);

    lines.push({
      label: course?.planName ?? "Treatment plan",
      // Says it is a part payment where it is one, so a patient holding a
      // receipt for ₹9,000 against a ₹30,000 course can see that on the paper.
      detail: course
        ? `${course.sittings} sittings over ${course.durationDays} days`
        : null,
      amountInPaise: p.amountInPaise,
    });
  }

  if (!lines.length) {
    lines.push({ label: "Payment", detail: p.note, amountInPaise: p.amountInPaise });
  }

  return {
    // A payment recorded before receipts existed has no number, and inventing
    // one now would put today's number on a month-old receipt.
    receiptNo: p.receiptNo ?? "—",
    collectedAt: p.collectedAt,
    voidedAt: p.voidedAt,
    voidReason: p.voidReason,
    clinic: profile,
    missing: missingProfileFields(profile),
    patient: {
      name: row.contactName ?? "Unknown",
      phone: row.contactPhone,
      email: row.contactEmail,
      patientCode: chart[0]?.code ?? null,
      contactId: p.contactId,
    },
    lines,
    amountInPaise: p.amountInPaise,
    method: p.method,
    methodLabel: PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method,
    reference: p.reference,
    note: p.note,
    kind: p.kind,
    kindLabel: PAYMENT_KINDS.find((k) => k.value === p.kind)?.label ?? p.kind,
    collectedBy: row.collectedBy ?? null,
    visitAt,
  };
}

/** ₹ with paise, the way a bill prints it. */
export function rupees(paise: number): string {
  return (
    "₹" +
    (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`;
  return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${under1000(n % 100)}` : ""}`;
}

/**
 * "Rupees nine thousand only" — the line every Indian receipt carries.
 *
 * It is there so a figure cannot be altered after the fact: changing 9,000 to
 * 90,000 on a printed slip is a stroke of a pen, and the words are not.
 * Grouped the Indian way — lakh and crore, not thousand and million.
 */
export function amountInWords(paise: number): string {
  const rupeesPart = Math.floor(paise / 100);
  const paisePart = paise % 100;

  if (rupeesPart === 0 && paisePart === 0) return "Rupees zero only";

  const parts: string[] = [];
  const crore = Math.floor(rupeesPart / 10_000_000);
  const lakh = Math.floor((rupeesPart % 10_000_000) / 100_000);
  const thousand = Math.floor((rupeesPart % 100_000) / 1000);
  const rest = rupeesPart % 1000;

  if (crore) parts.push(`${under1000(crore)} crore`);
  if (lakh) parts.push(`${under1000(lakh)} lakh`);
  if (thousand) parts.push(`${under1000(thousand)} thousand`);
  if (rest) parts.push(under1000(rest));

  const words = parts.join(" ").trim();
  const paiseWords = paisePart ? ` and ${under1000(paisePart)} paise` : "";
  const capitalised = words.charAt(0).toUpperCase() + words.slice(1);

  return `Rupees ${capitalised}${paiseWords} only`;
}
