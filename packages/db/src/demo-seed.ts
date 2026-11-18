import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import type { db as Db } from "./client";
import {
  account,
  appointment,
  automationFlow,
  automationFlowRun,
  automationFlowVersion,
  clinic,
  clinicMember,
  communicationConversation,
  communicationMessage,
  communicationTemplate,
  contact,
  leadSubmission,
  medicine,
  medicineSale,
  medicineSaleLine,
  patientRecord,
  payment,
  planEnrollment,
  planSitting,
  rolePermission,
  treatmentPlan,
  user,
} from "./schema";
import { DEFAULT_GRANTS, PERMISSION_KEYS } from "./permissions";
import { seedDemoPatient } from "./demo-patient";

/**
 * The demo's fictional world — two clinics, a staff team, ~300 leads from a
 * handful of ads, ~40 patients, and the WhatsApp automation behind them.
 *
 * Every name and number is made up; phone numbers sit in a range no real
 * mobile uses here (+91 70000 xxxxx). A fixed seed makes every reset produce
 * the same world, only shifted to "now", so a demo that resets at night looks
 * the same — and current — every morning.
 *
 * Run: pnpm --filter @workspace/db demo:seed   (or the nightly /api/demo/reset)
 */

type Database = typeof Db;

export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "predict-demo-2026";

/** Tables a reset keeps: who may do what, and the care-plan catalogue. */
const KEEP = /^(role_permission|user_permission|permission_move|care_plan|__drizzle)/;

// ── a small, seeded random — the same world on every reset ──────────────────
let state = 20261114;
function rand(): number {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number) => rand() < p;
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

const DAY = 86_400_000;
const HOUR = 3_600_000;

const FIRST = [
  "Aarav", "Vivaan", "Aditya", "Rohan", "Kabir", "Arjun", "Ishaan", "Rahul", "Vikram", "Sanjay",
  "Anil", "Suresh", "Rakesh", "Manoj", "Deepak", "Nitin", "Gaurav", "Harish", "Prakash", "Ramesh",
  "Ananya", "Diya", "Saanvi", "Priya", "Neha", "Pooja", "Kavita", "Sunita", "Meera", "Anjali",
  "Ritu", "Shalini", "Nisha", "Rekha", "Asha", "Usha", "Geeta", "Seema", "Kiran", "Lata",
];
const LAST = [
  "Sharma", "Verma", "Gupta", "Mehta", "Kapoor", "Malhotra", "Arora", "Bansal", "Chopra", "Khanna",
  "Joshi", "Saxena", "Agarwal", "Bhatia", "Sethi", "Tandon", "Kohli", "Nair", "Iyer", "Rao",
];
const CITIES = ["Delhi", "Gurugram", "Noida", "Ghaziabad", "Faridabad", "Delhi", "Delhi", "Noida"];

/** The ads the leads came from — names shaped like a real account's. */
const ADS = [
  { adId: "910000000000001", adName: "Knee pain testimonial | Demo", adset: "knee pain | 45+ | Delhi", campaign: "Knee Pain — Leads", weight: 26, quality: 0.55 },
  { adId: "910000000000002", adName: "Back pain explainer | Demo", adset: "back pain | 35+ | NCR", campaign: "Back Pain — Leads", weight: 18, quality: 0.8 },
  { adId: "910000000000003", adName: "Fall risk check | Demo", adset: "fall risk | 60+ | Delhi", campaign: "Seniors — Leads", weight: 16, quality: 1.2 },
  { adId: "910000000000004", adName: "Patient story — Ritu | Demo", adset: "testimonial | 40+ | NCR", campaign: "Testimonials — Leads", weight: 14, quality: 1.6 },
  { adId: "910000000000005", adName: "Neck pain reel | Demo", adset: "neck pain | 30+ | Delhi", campaign: "Neck Pain — Leads", weight: 10, quality: 0.6 },
  { adId: "910000000000006", adName: "Free assessment offer | Demo", adset: "all pain | 35+ | NCR", campaign: "Offer — Leads", weight: 10, quality: 0.9 },
  { adId: "910000000000007", adName: "Doctor explains surgery myths | Demo", adset: "knee surgery | 50+", campaign: "Knee Pain — Leads", weight: 6, quality: 1.4 },
];

const NURTURE = [
  { key: "demo_nurture_day_01", name: "Nurture — day 1", day: 0, body: "Hi {{1}} 👋 Thanks for reaching out about your pain. Our physiotherapists can assess you this week — would you like a call?" },
  { key: "demo_nurture_day_02", name: "Nurture — day 2", day: 1, body: "Hi {{1}}, most knee and back pain improves without surgery. Here is how our 21-day programme works." },
  { key: "demo_nurture_day_03", name: "Nurture — day 3", day: 3, body: "Hi {{1}}, a quick story from Ritu, 52 — walking pain-free again after 6 weeks." },
  { key: "demo_nurture_day_04", name: "Nurture — day 4", day: 6, body: "Hi {{1}}, your free assessment slot is still open this week. Reply YES and we will call you." },
  { key: "demo_nurture_day_05", name: "Nurture — day 5", day: 9, body: "Hi {{1}}, one last note — if pain is still part of your day, we are here when you are ready." },
];

const REPLIES = ["Yes, call me", "Price kitna hai?", "Kal call karna", "Yes", "Clinic kahan hai?", "Interested", "Not now", "Sunday open hai?"];

const MEDICINES = [
  { name: "Joint Care Capsules", rate: 45000, unit: "strip" },
  { name: "Pain Relief Gel 50g", rate: 22000, unit: "tube" },
  { name: "Calcium + D3 Tablets", rate: 18000, unit: "strip" },
  { name: "Herbal Oil 100ml", rate: 35000, unit: "bottle" },
  { name: "Knee Support Brace", rate: 120000, unit: "piece" },
  { name: "Anti-inflammatory Kit", rate: 79000, unit: "kit" },
];

const PLANS = [
  { name: "Two Limbs 21 Day — In station", limbs: "two", days: 21, sittings: 21, price: 3150000, perSession: false },
  { name: "Two Limbs 42 Day — In station", limbs: "two", days: 42, sittings: 42, price: 5600000, perSession: false },
  { name: "Four Limbs 21 Day — Out station", limbs: "four", days: 21, sittings: 21, price: 4200000, perSession: false },
  { name: "Two Limbs — single session", limbs: "two", days: 0, sittings: 0, price: 150000, perSession: true },
];

/** Empty every demo table (keeping permissions and the care-plan catalogue). */
async function wipe(db: Database) {
  const rows = (await db.execute(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  )).rows as { tablename: string }[];
  const tables = rows.map((r) => r.tablename).filter((t) => !KEEP.test(t));
  if (tables.length) await db.execute(sql.raw(`truncate table ${tables.map((t) => `"${t}"`).join(", ")} restart identity cascade`));
}

export async function seedDemo(db: Database): Promise<Record<string, number>> {
  // This wipes the database first. Demo mode is on by default in this repo, so
  // that alone is no protection — the database itself must say it is a demo.
  if (process.env.DEMO_MODE === "0") {
    throw new Error("Refusing to seed: DEMO_MODE is 0.");
  }
  const target = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").pathname.replace(/^\//, "");
    } catch {
      return "";
    }
  })();
  if (!/demo/i.test(target) && process.env.DEMO_SEED_FORCE !== "1") {
    throw new Error(
      `Refusing to seed "${target || "unknown database"}": the database name must contain "demo". ` +
        "This wipes every table — set DEMO_SEED_FORCE=1 only if this really is a throwaway database.",
    );
  }
  state = 20261114;
  const now = Date.now();
  const at = (msAgo: number) => new Date(now - msAgo);

  await wipe(db);

  // Truncating users cascades into role_permission (it names who granted),
  // so the default grants go back in — the same ones seed-role-permissions writes.
  for (const [role, permissions] of Object.entries(DEFAULT_GRANTS)) {
    const valid = permissions.filter((p) => PERMISSION_KEYS.includes(p));
    if (valid.length) await db.insert(rolePermission).values(valid.map((permission) => ({ role, permission }))).onConflictDoNothing();
  }

  // ── clinics ────────────────────────────────────────────────────────────────
  const physioId = randomUUID();
  const predictId = randomUUID();
  await db.insert(clinic).values([
    {
      id: physioId, name: "Demo Physio Clinic", shortName: "Demo Physio", slug: "demo-physio", city: "New Delhi", state: "Delhi",
      addressLine1: "12, Example Market, Sector 9", pincode: "110001", phone: "+91 70000 00000", email: "hello@demo-physio.example",
      receiptPrefix: "DPC", brandColor: "#0E7C66", modules: ["appointments", "therapy", "medicine", "billing"],
      createdAt: at(120 * DAY), updatedAt: at(120 * DAY),
    },
    {
      id: predictId, name: "Predict Diagnostics (Demo)", shortName: "Predict", slug: "predict-demo", city: "New Delhi", state: "Delhi",
      receiptPrefix: "PRD", brandColor: "#8504FE", modules: ["diagnosis"], createdAt: at(119 * DAY), updatedAt: at(119 * DAY),
    },
  ]);

  // ── staff (all share the public demo password) ───────────────────────────────
  const hash = await hashPassword(DEMO_PASSWORD);
  const staff = [
    { key: "ops", name: "Ops Manager (Demo)", email: "ops@demo.predict.fit", role: "admin", clinics: [physioId] },
    { key: "caller", name: "Telecaller (Demo)", email: "caller@demo.predict.fit", role: "health_coach", clinics: [physioId] },
    { key: "admin", name: "Clinic Admin (Demo)", email: "admin@demo.predict.fit", role: "admin", clinics: [physioId, predictId] },
    { key: "desk", name: "Front Desk (Demo)", email: "desk@demo.predict.fit", role: "receptionist", clinics: [physioId] },
    { key: "doctor", name: "Dr. Demo Physio", email: "doctor@demo.predict.fit", role: "doctor", clinics: [physioId] },
    { key: "predict", name: "Predict Team (Demo)", email: "predict@demo.predict.fit", role: "admin", clinics: [predictId] },
  ] as const;
  const ids: Record<string, string> = {};
  for (const s of staff) {
    const id = randomUUID();
    ids[s.key] = id;
    await db.insert(user).values({ id, name: s.name, email: s.email, emailVerified: true, role: s.role, createdAt: at(100 * DAY), updatedAt: at(100 * DAY) });
    await db.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash, createdAt: at(100 * DAY), updatedAt: at(100 * DAY) });
    for (const c of s.clinics) await db.insert(clinicMember).values({ clinicId: c, userId: id, role: s.role, createdAt: at(100 * DAY) });
  }

  // ── the patient site's demo patient: catalogue, blood panel, biological age
  const patientSeed = await seedDemoPatient(db, { clinicId: physioId, passwordHash: hash, now });

  // ── catalogue: medicines, plans, templates, flows ───────────────────────────
  const medIds = MEDICINES.map(() => randomUUID());
  await db.insert(medicine).values(MEDICINES.map((m, i) => ({ id: medIds[i]!, name: m.name, unit: m.unit, rateInPaise: m.rate })));
  const planIds = PLANS.map(() => randomUUID());
  await db.insert(treatmentPlan).values(
    PLANS.map((p, i) => ({ id: planIds[i]!, name: p.name, limbs: p.limbs, durationDays: p.days, sittings: p.sittings, priceInPaise: p.price, isPerSession: p.perSession, advancePercent: p.perSession ? 0 : 30, sortOrder: i })),
  );

  const tplIds: Record<string, string> = {};
  for (const t of NURTURE) {
    tplIds[t.key] = randomUUID();
    await db.insert(communicationTemplate).values({
      id: tplIds[t.key], key: t.key, name: t.name, channel: "whatsapp", category: "marketing", providerTemplateName: t.key,
      variablesSchema: ["name"], wabaCategory: "MARKETING", language: "en", headerType: "NONE", bodyText: t.body, bodyExamples: ["Rahul"], submissionStatus: "approved",
    });
  }
  const extra = [
    { key: "visit_confirmed", name: "Visit confirmed", body: "Hi {{1}}, your visit at Demo Physio Clinic is confirmed. See you soon!" },
    { key: "diet_checkin", name: "Diet check-in", body: "Hi {{1}}, how well did you follow your diet plan yesterday? 🥗" },
    { key: "results_ready_login", name: "Results ready — sign-in link", body: "Hi {{1}}, your blood test report is ready. Tap below to view it." },
  ];
  for (const t of extra) {
    tplIds[t.key] = randomUUID();
    await db.insert(communicationTemplate).values({ id: tplIds[t.key], key: t.key, name: t.name, channel: "whatsapp", category: "transactional", providerTemplateName: t.key, variablesSchema: ["name"], wabaCategory: "UTILITY", language: "en", headerType: "NONE", bodyText: t.body, bodyExamples: ["Rahul"], submissionStatus: "approved" });
  }

  const nurtureFlow = randomUUID();
  const nurtureVersion = randomUUID();
  await db.insert(automationFlow).values({ id: nurtureFlow, clinicId: physioId, name: "14-day nurture — new lead", triggerEventType: "LEAD_STATUS_NEW", status: "active", activatedAt: at(90 * DAY), createdAt: at(90 * DAY), updatedAt: at(90 * DAY) });
  await db.insert(automationFlowVersion).values({ id: nurtureVersion, flowId: nurtureFlow, versionNumber: 1, nodes: [], edges: [], isActive: true, publishedAt: at(90 * DAY), createdAt: at(90 * DAY) });
  const reminderFlow = randomUUID();
  const reminderVersion = randomUUID();
  await db.insert(automationFlow).values({ id: reminderFlow, clinicId: physioId, name: "Visit reminders", triggerEventType: "APPOINTMENT_CREATED", status: "active", activatedAt: at(90 * DAY), createdAt: at(90 * DAY), updatedAt: at(90 * DAY) });
  await db.insert(automationFlowVersion).values({ id: reminderVersion, flowId: reminderFlow, versionNumber: 1, nodes: [], edges: [], isActive: true, publishedAt: at(90 * DAY), createdAt: at(90 * DAY) });

  // ── leads, their ads, the automation, and what happened next ────────────────
  const totalWeight = ADS.reduce((a, b) => a + b.weight, 0);
  const pickAd = () => {
    let r = rand() * totalWeight;
    for (const a of ADS) if ((r -= a.weight) <= 0) return a;
    return ADS[0]!;
  };

  // Rows are gathered here and written in batches at the end — one insert per
  // row is thousands of round trips to the database, minutes instead of seconds.
  const B = {
    contacts: [] as (typeof contact.$inferInsert)[],
    leads: [] as (typeof leadSubmission.$inferInsert)[],
    runs: [] as (typeof automationFlowRun.$inferInsert)[],
    conversations: [] as (typeof communicationConversation.$inferInsert)[],
    messages: [] as (typeof communicationMessage.$inferInsert)[],
    patients: [] as (typeof patientRecord.$inferInsert)[],
    appointments: [] as (typeof appointment.$inferInsert)[],
    enrollments: [] as (typeof planEnrollment.$inferInsert)[],
    sittings: [] as (typeof planSitting.$inferInsert)[],
    sales: [] as (typeof medicineSale.$inferInsert)[],
    saleLines: [] as (typeof medicineSaleLine.$inferInsert)[],
    payments: [] as (typeof payment.$inferInsert)[],
  };

  let phoneSeq = 0;
  let patientSeq = 0;
  let receiptSeq = 0;
  const counts = { leads: 0, patients: 0, messages: 0, appointments: 0, payments: 0, courses: 0, medicineSales: 0 };
  const receipt = () => `DPC/26-27/${String(++receiptSeq).padStart(5, "0")}`;

  async function makePatient(contactId: string, name: string, phone: string, createdAt: Date) {
    const [first, ...rest] = name.split(" ");
    const id = randomUUID();
    patientSeq++;
    B.patients.push({
      id, sequenceNo: patientSeq, patientCode: `P${String(patientSeq).padStart(6, "0")}`, contactId, firstName: first!, lastName: rest.join(" ") || "-",
      gender: chance(0.5) ? "MALE" : "FEMALE", dateOfBirth: `${between(1950, 1992)}-0${between(1, 9)}-1${between(0, 9)}`, mobileNumber: phone, createdAt, updatedAt: createdAt,
    });
    counts.patients++;
    return id;
  }

  /** A visit, its fee paid; maybe a course with sittings, maybe medicine. */
  async function treat(contactId: string, visitAt: Date, opts: { course: boolean; medicine: boolean; done: boolean }) {
    const apptId = randomUUID();
    B.appointments.push({
      id: apptId, clinicId: physioId, contactId, doctorUserId: ids.doctor, type: "consultation", scheduledAt: visitAt,
      status: opts.done ? "completed" : "scheduled", feeInPaise: 120000, arrivedAt: opts.done ? visitAt : null, createdAt: new Date(visitAt.getTime() - 2 * DAY), updatedAt: visitAt,
    });
    counts.appointments++;
    if (!opts.done) return;
    B.payments.push({ clinicId: physioId, contactId, kind: "consultation", appointmentId: apptId, amountInPaise: 120000, method: pick(["cash", "upi", "upi", "card"]), receiptNo: receipt(), collectedByUserId: ids.desk, collectedAt: visitAt, createdAt: visitAt });
    counts.payments++;

    if (opts.course) {
      const p = pick(PLANS.slice(0, 3));
      const enrollmentId = randomUUID();
      const start = new Date(visitAt.getTime() + DAY);
      const elapsed = Math.max(0, Math.floor((now - start.getTime()) / DAY));
      const finished = elapsed >= p.days;
      B.enrollments.push({
        id: enrollmentId, clinicId: physioId, contactId, treatmentPlanId: planIds[PLANS.indexOf(p)], planName: p.name, limbs: p.limbs, durationDays: p.days, sittings: p.sittings,
        priceInPaise: p.price, advancePercent: 30, startDate: start.toISOString().slice(0, 10), status: finished ? "completed" : "active", enrolledByUserId: ids.desk,
        prescribedByUserId: ids.doctor, prescribedAtAppointmentId: apptId, activatedAt: start, createdAt: visitAt, updatedAt: visitAt,
      });
      counts.courses++;
      const sittings = Array.from({ length: p.sittings }, (_, d) => {
        const planned = new Date(start.getTime() + d * DAY);
        const past = planned.getTime() < now - DAY;
        return {
          enrollmentId, contactId, dayNumber: d + 1, plannedDate: planned.toISOString().slice(0, 10), mode: "in_clinic",
          status: past ? (chance(0.9) ? "done" : "missed") : "pending", completedAt: past ? planned : null, loggedSource: past ? "staff" : null,
        };
      });
      B.sittings.push(...sittings);
      // An advance on the day, the rest in one or two parts.
      const advance = Math.round(p.price * 0.3);
      B.payments.push({ clinicId: physioId, contactId, kind: "treatment_plan", enrollmentId, amountInPaise: advance, method: "upi", receiptNo: receipt(), collectedByUserId: ids.desk, collectedAt: visitAt, createdAt: visitAt });
      counts.payments++;
      if (elapsed > 7 || chance(0.4)) {
        const paidAt = new Date(Math.min(now - HOUR, start.getTime() + 7 * DAY));
        const rest = chance(0.8) ? p.price - advance : Math.round((p.price - advance) / 2);
        B.payments.push({ clinicId: physioId, contactId, kind: "treatment_plan", enrollmentId, amountInPaise: rest, method: pick(["upi", "card", "bank"]), receiptNo: receipt(), collectedByUserId: ids.desk, collectedAt: paidAt, createdAt: paidAt });
        counts.payments++;
      }
    }

    if (opts.medicine) {
      const lines = Array.from({ length: between(1, 3) }, () => {
        const i = between(0, MEDICINES.length - 1);
        const q = between(1, 2);
        return { medicineId: medIds[i]!, name: MEDICINES[i]!.name, quantity: q, rateInPaise: MEDICINES[i]!.rate, amountInPaise: q * MEDICINES[i]!.rate };
      });
      const total = lines.reduce((a, l) => a + l.amountInPaise, 0);
      const saleId = randomUUID();
      B.sales.push({ id: saleId, contactId, clinicId: physioId, appointmentId: apptId, grossInPaise: total, totalInPaise: total, soldByUserId: ids.desk, soldAt: visitAt });
      B.saleLines.push(...lines.map((l, i) => ({ ...l, saleId, sortOrder: i })));
      B.payments.push({ clinicId: physioId, contactId, kind: "medicine", appointmentId: apptId, medicineSaleId: saleId, amountInPaise: total, method: "cash", receiptNo: receipt(), collectedByUserId: ids.desk, collectedAt: visitAt, createdAt: visitAt });
      counts.medicineSales++;
      counts.payments++;
    }
  }

  for (let i = 0; i < 300; i++) {
    const ad = pickAd();
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const phone = `9170000${String(10000 + ++phoneSeq).slice(-5)}`;
    // More leads lately, as a live account would have.
    const ageDays = Math.floor(Math.pow(rand(), 1.6) * 75);
    const arrived = at(ageDays * DAY + between(0, 20) * HOUR);
    const contactId = randomUUID();

    // How far this lead goes — better ads convert better.
    const q = ad.quality;
    const visited = ageDays > 3 && chance(0.06 * q);
    const booked = visited || (ageDays > 1 && chance(0.05 * q));
    const reached = booked || chance(ageDays > 2 ? 0.35 : 0.15);
    const status = visited
      ? "VISITED"
      : booked
        ? pick(["APPOINTMENT_BOOKED", "APPOINTMENT_CONFIRMED", "APPOINTMENT_CANCELLED"])
        : reached
          ? pick(["CONTACTED", "NO_ANSWER", "NO_ANSWER", "INTERESTED", "CALLBACK_LATER", "NOT_INTERESTED", "INFO_SENT"])
          : "NEW";

    B.contacts.push({
      id: contactId, name, phone, stage: visited ? "PATIENT" : booked ? "BOOKED" : "LEAD", source: "META_LEAD_AD", sourcePlatform: "facebook", campaign: ad.campaign,
      clinicId: physioId, city: pick(CITIES), leadStatus: status, leadStatusAt: reached ? new Date(arrived.getTime() + between(1, 30) * HOUR) : arrived,
      assignedUserId: chance(0.7) ? ids.caller : null, assignedRole: "health_coach", assignedAt: arrived,
      callbackAt: status === "CALLBACK_LATER" ? new Date(now + between(1, 30) * HOUR) : null,
      firstTouchAt: arrived, lastTouchAt: arrived, createdAt: arrived, updatedAt: arrived,
    });
    counts.leads++;

    B.leads.push({
      contactId, clinicId: physioId, provider: "meta", externalId: `demo-lead-${i}`, formName: `${ad.campaign} form`, campaignName: ad.campaign, adsetName: ad.adset,
      adId: ad.adId, adName: ad.adName, platform: "fb", answers: { full_name: name, city: "Delhi" }, isTest: false, isOrganic: false, submittedAt: arrived, receivedAt: arrived,
    });

    // The nurture run and its messages, as far as the lead has got.
    const runId = randomUUID();
    const runStart = new Date(arrived.getTime() + 30 * 60_000);
    B.runs.push({ id: runId, flowId: nurtureFlow, flowVersionId: nurtureVersion, contactId, status: booked ? "completed" : ageDays > 10 ? "completed" : "waiting", startedAt: runStart, completedAt: booked || ageDays > 10 ? at(Math.max(0, ageDays - 10) * DAY) : null });
    const convId = randomUUID();
    let last = runStart;
    const conversation: typeof communicationConversation.$inferInsert = { id: convId, contactId, channel: "whatsapp", status: "open", createdAt: runStart, lastMessageAt: runStart, lastReadAt: at(HOUR) };
    B.conversations.push(conversation);
    const msgs: (typeof communicationMessage.$inferInsert)[] = [];
    let replied = false;
    for (const step of NURTURE) {
      const sentAt = new Date(runStart.getTime() + step.day * DAY);
      if (sentAt.getTime() > now || (booked && step.day > 3)) break;
      // Meta's marketing limit holds back many sends, more later in the flow.
      const failRate = 0.25 + step.day * 0.04;
      const s = chance(failRate) ? "failed" : chance(0.78) ? "read" : "delivered";
      msgs.push({ conversationId: convId, contactId, direction: "outbound", channel: "whatsapp", templateId: tplIds[step.key], body: step.body.replace("{{1}}", name.split(" ")[0]!), status: s, runId, createdAt: sentAt });
      last = sentAt;
      if (!replied && s !== "failed" && chance(reached ? 0.22 : 0.05)) {
        replied = true;
        const replyAt = new Date(sentAt.getTime() + between(5, 300) * 60_000);
        if (replyAt.getTime() < now) {
          msgs.push({ conversationId: convId, contactId, direction: "inbound", channel: "whatsapp", body: pick(REPLIES), status: "delivered", createdAt: replyAt });
          last = replyAt;
        }
      }
    }
    if (msgs.length) {
      B.messages.push(...msgs);
      counts.messages += msgs.length;
      conversation.lastMessageAt = last;
    }

    if (booked) {
      const visitAt = new Date(arrived.getTime() + between(2, 6) * DAY + between(10, 18) * HOUR);
      const done = visited && visitAt.getTime() < now;
      if (status !== "APPOINTMENT_CANCELLED") {
        if (visited) await makePatient(contactId, name, phone, visitAt);
        await treat(contactId, visitAt.getTime() > now ? new Date(now + between(2, 50) * HOUR) : visitAt, { course: done && chance(0.65), medicine: done && chance(0.5), done });
      }
    }
  }

  // ── walk-ins: patients who never came from an ad, and today's schedule ─────
  for (let i = 0; i < 18; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const phone = `9170000${String(10000 + ++phoneSeq).slice(-5)}`;
    const contactId = randomUUID();
    const firstVisit = at(between(2, 70) * DAY + between(1, 8) * HOUR);
    B.contacts.push({ id: contactId, name, phone, stage: "PATIENT", source: "IN_CLINIC", clinicId: physioId, city: pick(CITIES), leadStatus: "VISITED", leadStatusAt: firstVisit, firstTouchAt: firstVisit, lastTouchAt: firstVisit, createdAt: firstVisit, updatedAt: firstVisit });
    await makePatient(contactId, name, phone, firstVisit);
    await treat(contactId, firstVisit, { course: chance(0.6), medicine: chance(0.55), done: true });
  }
  // Today: a few booked visits for the front desk.
  for (let i = 0; i < 6; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const phone = `9170000${String(10000 + ++phoneSeq).slice(-5)}`;
    const contactId = randomUUID();
    const today = new Date();
    today.setHours(10 + i, i % 2 ? 30 : 0, 0, 0);
    B.contacts.push({ id: contactId, name, phone, stage: "BOOKED", source: "PHONE", clinicId: physioId, city: pick(CITIES), leadStatus: "APPOINTMENT_CONFIRMED", leadStatusAt: at(DAY), createdAt: at(2 * DAY), updatedAt: at(DAY) });
    B.appointments.push({ clinicId: physioId, contactId, doctorUserId: ids.doctor, type: "consultation", scheduledAt: today, status: i < 2 ? "completed" : "confirmed", feeInPaise: 120000, arrivedAt: i < 2 ? today : null, createdAt: at(2 * DAY), updatedAt: at(DAY) });
    counts.appointments++;
  }

  const write = async <T extends Record<string, unknown>>(table: Parameters<typeof db.insert>[0], rows: T[]) => {
    for (let i = 0; i < rows.length; i += 500) await db.insert(table).values(rows.slice(i, i + 500) as never);
  };
  await write(contact, B.contacts);
  await write(leadSubmission, B.leads);
  await write(automationFlowRun, B.runs);
  await write(communicationConversation, B.conversations);
  await write(communicationMessage, B.messages);
  await write(patientRecord, B.patients);
  await write(appointment, B.appointments);
  await write(planEnrollment, B.enrollments);
  await write(planSitting, B.sittings);
  await write(medicineSale, B.sales);
  await write(medicineSaleLine, B.saleLines);
  await write(payment, B.payments);

  return { ...counts, demoPatientReadings: patientSeed.readings, demoPatientScored: patientSeed.scored ? 1 : 0 };
}
