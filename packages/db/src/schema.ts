import { pgTable, text, timestamp, boolean, date, unique, uniqueIndex, index, doublePrecision, integer, jsonb, serial, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { DEFAULT_CONSULTATION_FEE_PAISE } from "./payment";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text("role"),
  // better-auth admin plugin fields. A ban blocks sign-in and better-auth
  // shows banReason to the user on their next attempt.
  banned: boolean("banned").default(false).notNull(),
  banReason: text("ban_reason"),
  // Always null: the app never sets an expiry, bans are lifted by a person.
  // Kept only because better-auth writes banExpires: null on every unban —
  // dropping the column breaks unbanning.
  banExpires: timestamp("ban_expires"),
  /**
   * The mobile a patient signs in with by OTP (better-auth phone-number
   * plugin). Same shape as contact.phone — country code and digits, no "+" —
   * so it can be compared to every other phone in this database directly.
   */
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified").default(false),
});

/**
 * One row per OTP send attempt — sent, failed, or withheld.
 *
 * The WhatsApp-then-SMS rule is read from here on the server: three WhatsApp
 * attempts, then SMS unlocks. A rule kept only in the browser is a
 * suggestion, and every sms row is a message somebody paid for.
 */
export const otpDelivery = pgTable(
  "otp_delivery",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    phone: text("phone").notNull(),
    channel: text("channel").notNull(), // whatsapp | sms
    // sent: handed to the provider. failed: the provider refused it.
    // withheld: nothing was sent because no account uses this number — logged
    // like a send so the response cannot reveal who is a patient.
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("otp_delivery_phone_created_idx").on(table.phone, table.createdAt)],
);

/**
 * A sign-in link the clinic sends a patient: open it and the dashboard opens,
 * no number or code to type. Reusable until it expires (7 days) or is revoked.
 *
 * Only the SHA-256 of the token is kept — the link itself is shown once, when
 * it is made. Issuing a new one revokes the previous, so there is at most one
 * live link per account.
 */
export const loginLink = pgTable(
  "login_link",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdByUserId: text("created_by_user_id"),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    lastUsedAt: timestamp("last_used_at"),
    useCount: integer("use_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("login_link_user_idx").on(table.userId)],
);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// The clinical chart: the single source of truth for patient demographics.
// Distinct from `contact`, which is the CRM/lifecycle row that exists from
// the moment someone is a lead — a person has a contact row first, and only
// gains a patientRecord once they are actually a patient.
// sequenceNo backs patientCode generation (P000001, P000002, ...): insert
// the row first, then format patientCode from the auto-assigned sequenceNo.
export const patientRecord = pgTable("patient_record", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sequenceNo: serial("sequence_no").notNull(),
  patientCode: text("patient_code").notNull().unique(),
  // The person this chart belongs to. contact is the anchor every human
  // gets on first touch, so a walk-in with no login still has exactly one
  // identity — before this existed, contact and patient_record could only
  // meet through `user`, and deleting a user orphaned the chart for good.
  contactId: text("contact_id")
    .unique()
    .references(() => contact.id, { onDelete: "cascade" }),
  // Nullable+unique: a patient record can exist without a login account
  // (walk-ins); when linked, at most one per user. Kept alongside
  // contactId because better-auth sessions resolve by user, not contact.
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  gender: text("gender").notNull(), // MALE | FEMALE | OTHER
  dateOfBirth: date("date_of_birth").notNull(),
  bloodGroup: text("blood_group"),
  mobileNumber: text("mobile_number").notNull(),
  alternateMobile: text("alternate_mobile"),
  email: text("email"),
  profilePhoto: text("profile_photo"),
  maritalStatus: text("marital_status"),
  nationality: text("nationality"),
  language: text("language"),
  // Disease/treatment protocol classification (e.g. "knee_osteoarthritis",
  // "sciatica") — lets a flow's Condition node route by which protocol a
  // patient is on. Free text, not an enum: new protocols shouldn't need a
  // migration.
  conditionType: text("condition_type"),
  // Which review cadence applies (Days 6/21/42 in-clinic vs 15/30/60
  // tele-consult) — see the "IN-STATION"/"OUT-STATION" tracks.
  patientTrack: text("patient_track"), // in_station | out_station
  /**
   * The composite index this patient's biological age is built from, chosen
   * by the clinic. Null means the default (CBLAI — see patient-index.ts), so
   * a patient nobody has decided about follows the default and one somebody
   * has chosen for keeps that choice.
   */
  biomarkerIndexId: text("biomarker_index_id").references(() => biomarkerIndex.id, {
    onDelete: "set null",
  }),
  // Day 1 of the clinical journey — the anchor every "Day N" Delay node in
  // a flow counts from. Set once, when a lead actually converts/onboards
  // (not the same moment as account registration).
  onboardedAt: timestamp("onboarded_at"),
  /**
   * This patient's profile in VALD, where DynaMo strength tests are recorded.
   *
   * The link has to be stored because it cannot be derived. VALD's profile
   * holds a name, date of birth, sex and email and no phone number, so there
   * is no shared natural key between the two systems — we write our own id
   * into the VALD profile and keep VALD's id here.
   */
  valdProfileId: text("vald_profile_id"),
  valdLinkedAt: timestamp("vald_linked_at"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

/**
 * The DynaMo tests the clinic can run — our own catalogue, in our database.
 *
 * Seeded from VALD's DynaMo app (every test it offers, with VALD's region /
 * movement / position names so results line up with tests synced from VALD)
 * and from VALD's public protocol pages for the steps and the video. From
 * then on it is the clinic's: tests can be switched off, edited, added, and a
 * clinic-made video put in place of VALD's. See drizzle/0086.
 */
export const valdTestType = pgTable("vald_test_type", {
  /** Stable key, stored on a prescription line (ProtocolExercise.vald). */
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  region: text("region").notNull(),
  /** VALD spells it "RangeofMotion". */
  category: text("category").notNull(),
  movement: text("movement").notNull(),
  position: text("position").notNull(),
  positionLabel: text("position_label").notNull(),
  /** "Bilateral" — a left and a right; "None" — one measurement (neck, trunk). */
  laterality: text("laterality").notNull().default("Bilateral"),
  /** "force" | "rom" */
  kind: text("kind").notNull(),
  /** Added to a ROM result: −90 for knee and elbow extension, as VALD does. */
  romOffsetDegrees: doublePrecision("rom_offset_degrees").notNull().default(0),
  /** A DynaMo Grip can run it (only the grip squeeze). */
  gripDeviceOk: boolean("grip_device_ok").notNull().default(false),
  /** How to set the patient up, shown beside the runner. */
  setup: text("setup"),
  /** The how-to video: VALD's for now, the clinic's own later. */
  videoUrl: text("video_url"),
  /** "vald" | "clinic" */
  videoSource: text("video_source"),
  /** Where the steps and video came from. */
  sourceUrl: text("source_url"),
  /** Shown first in the picker — the tests the clinic actually uses. */
  featured: boolean("featured").notNull().default(false),
  active: boolean("active").notNull().default(true),
  /** "vald" for the seeded catalogue, "clinic" for one added here. */
  origin: text("origin").notNull().default("vald"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * A DynaMo test, cached from VALD.
 *
 * Kept locally so the strength history survives a profile being deleted in
 * VALD, and so a clinical page still renders when their API is unreachable.
 */
export const valdTest = pgTable(
  "vald_test",
  {
    /** VALD's test id, so a re-sync updates instead of duplicating. */
    id: text("id").primaryKey(),
    patientId: text("patient_id")
      .notNull()
      .references(() => patientRecord.id, { onDelete: "cascade" }),
    valdProfileId: text("vald_profile_id").notNull(),
    /**
     * The consultation it was run at, for a test run in the clinic over
     * Bluetooth. Null for tests synced from VALD's cloud. See drizzle/0085.
     */
    appointmentId: text("appointment_id").references(() => appointment.id, { onDelete: "set null" }),
    testCategory: text("test_category"),
    bodyRegion: text("body_region"),
    movement: text("movement"),
    position: text("position"),
    laterality: text("laterality"),
    testedAt: timestamp("tested_at").notNull(),
    durationSeconds: doublePrecision("duration_seconds"),
    /** Newtons as the device reports them; kilograms are a display choice. */
    leftMaxForceNewtons: doublePrecision("left_max_force_newtons"),
    rightMaxForceNewtons: doublePrecision("right_max_force_newtons"),
    leftRomDegrees: doublePrecision("left_rom_degrees"),
    rightRomDegrees: doublePrecision("right_rom_degrees"),
    /** As VALD calculates it, so our number matches their Hub report. */
    asymmetryPercent: doublePrecision("asymmetry_percent"),
    /**
     * Everything else the test measured, per side: rate of force development,
     * time to peak force, impulse, average force, rep count.
     *
     * One document rather than ten columns, because the set of metrics differs
     * between a strength test and a range-of-motion one and VALD adds to it
     * between API versions.
     */
    sides: jsonb("sides"),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    /**
     * Muscle age and the rest, worked out once when the test is saved, from the
     * age and sex the patient had then — see ./muscle-age.ts and drizzle/0089.
     */
    assessedAge: integer("assessed_age"),
    assessedSex: text("assessed_sex"),
    /** The age at which this result is the average for their sex. Strength tests with a reference only. */
    muscleAge: doublePrecision("muscle_age"),
    /** 1–99: where the result sits among people of their own age and sex. */
    strengthPercentile: integer("strength_percentile"),
    /** What the reference expects at their age, newtons. */
    expectedNewtons: doublePrecision("expected_newtons"),
    /** ROM tests: the range measured as a share of the normal range, %. */
    romPercentOfNormal: doublePrecision("rom_percent_of_normal"),
    /** Which published reference the numbers above come from. */
    normSource: text("norm_source"),
  },
  (table) => [
    index("vald_test_patient_id_idx").on(table.patientId),
    index("vald_test_tested_at_idx").on(table.testedAt),
  ],
);

/**
 * An EMG recording made in the clinic with the Predict EMG armband, optionally
 * alongside a DynaMo — see drizzle/0099. The raw signal (every ADC code) is a
 * private file at rawUrl; the row keeps what the clinic reads.
 */
export const emgRecording = pgTable(
  "emg_recording",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    patientId: text("patient_id")
      .notNull()
      .references(() => patientRecord.id, { onDelete: "cascade" }),
    appointmentId: text("appointment_id").references(() => appointment.id, { onDelete: "set null" }),
    clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
    protocolName: text("protocol_name").notNull(),
    montage: text("montage"),
    /** left | right | both — the side the band was on. */
    side: text("side"),
    /** [{ channel, muscle, siteNotes }] as placed. */
    placements: jsonb("placements").notNull().default([]),
    /** { name, firmware, battery } of the band, and the DynaMo if one was used. */
    device: jsonb("device").notNull().default({}),
    sampleRateHz: integer("sample_rate_hz").notNull().default(500),
    channelCount: integer("channel_count").notNull().default(3),
    durationSeconds: doublePrecision("duration_seconds").notNull(),
    samplesReceived: integer("samples_received").notNull(),
    samplesMissing: integer("samples_missing").notNull().default(0),
    /** [{ t, label, phase? }] — seconds from the first sample. */
    markers: jsonb("markers").notNull().default([]),
    /** Per-channel and per-phase results; see apps/clinic src/lib/emg/metrics.ts. */
    metrics: jsonb("metrics").notNull().default({}),
    /** A light RMS envelope per channel for the chart: { hz, channels: number[][] }. */
    envelope: jsonb("envelope").notNull().default({}),
    /** The DynaMo force alongside, if used: { t: seconds[], newtons: number[] }. */
    force: jsonb("force"),
    rawUrl: text("raw_url"),
    notes: text("notes"),
    recordedAt: timestamp("recorded_at").notNull(),
    recordedByUserId: text("recorded_by_user_id"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("emg_recording_patient_idx").on(table.patientId, table.recordedAt),
    index("emg_recording_appointment_idx").on(table.appointmentId),
  ],
);

/** One patient's muscle age on one clinic day, over every test with a reference. */
export const valdAssessment = pgTable(
  "vald_assessment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    patientId: text("patient_id")
      .notNull()
      .references(() => patientRecord.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    appointmentId: text("appointment_id").references(() => appointment.id, { onDelete: "set null" }),
    actualAge: integer("actual_age"),
    sex: text("sex"),
    /** Over every strength test that day with a reference. */
    muscleAge: doublePrecision("muscle_age"),
    gripMuscleAge: doublePrecision("grip_muscle_age"),
    gripPercentile: integer("grip_percentile"),
    /** [{ testId, label, muscleAge, percentile }] — what went into muscleAge. */
    tests: jsonb("tests").notNull().default([]),
    computedAt: timestamp("computed_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("vald_assessment_patient_day_unique").on(table.patientId, table.day)],
);

/**
 * Somebody who walked up to a stall at an event, gripped a dynamometer, and
 * left with a link.
 *
 * Deliberately not a contact or a patient_record. These people have not
 * consented to care and most will never return; folding a few thousand of them
 * into the chart tables would corrupt every patient count in the product. One
 * that becomes a real patient is converted explicitly.
 */
export const eventLead = pgTable(
  "event_lead",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** The two parts, taken separately — VALD requires both, and splitting a
     *  single box on whitespace guessed wrong for anyone with one name or a
     *  two-word first name. */
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** Kept as the display string, so pages and metadata read one field. */
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    /**
     * Required, not optional. Grip strength norms are entirely age- and
     * sex-specific, so without these there is no comparison to draw and no
     * grip age to report.
     */
    ageYears: integer("age_years").notNull(),
    /** male | female | other — how they identify. Goes to VALD. */
    sex: text("sex").notNull(),
    /**
     * Which published curve their grip is compared against: male | female |
     * null.
     *
     * A separate question from `sex` on purpose. The norms have two curves and
     * no third, so somebody who answers "other" is asked which reference they
     * want — and is not forced to pick one. Null means no muscle age, which is
     * the honest outcome rather than a number computed off a guess.
     */
    normReference: text("norm_reference"),
    /** Short, read off a screen. Never sufficient alone — see event-lead.ts. */
    claimCode: text("claim_code").notNull().unique(),
    /** Long and random. This is the share link, so it must not be guessable. */
    shareToken: text("share_token").notNull().unique(),
    eventName: text("event_name"),
    valdProfileId: text("vald_profile_id"),
    testId: text("test_id"),
    testedAt: timestamp("tested_at"),
    peakLeftNewtons: doublePrecision("peak_left_newtons"),
    peakRightNewtons: doublePrecision("peak_right_newtons"),
    asymmetryPercent: doublePrecision("asymmetry_percent"),
    /**
     * Computed once and stored. A link somebody already shared must keep
     * saying the same thing if the norm table is edited later.
     */
    gripAgeYears: doublePrecision("grip_age_years"),
    percentile: doublePrecision("percentile"),
    /** The force-time curve, thinned. The one visual worth the whole page. */
    forceTrace: jsonb("force_trace"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("event_lead_phone_idx").on(table.phone),
    index("event_lead_created_at_idx").on(table.createdAt),
  ],
);

/**
 * A blood test the clinic sells: which markers, at what price, for whom.
 *
 * The order is the anchor. It carries the bill, it is what a payment settles,
 * and both the lab's report and every reading taken from it point back at it —
 * so a value in the chart can always be traced to the draw that produced it.
 */
export const bloodTestOrder = pgTable(
  "blood_test_order",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    patientId: text("patient_id")
      .notNull()
      .references(() => patientRecord.id, { onDelete: "cascade" }),
    /** Money hangs off the contact everywhere in this product. */
    contactId: text("contact_id").references(() => contact.id, { onDelete: "set null" }),
    /** ordered | collected | reported | cancelled */
    status: text("status").notNull().default("ordered"),
    orderedOn: date("ordered_on").notNull(),
    /** The day blood was drawn, not the day it was ordered or reported. */
    collectedOn: date("collected_on"),
    /** Frozen sum of the items. Never recomputed from today's catalogue. */
    totalInPaise: integer("total_in_paise").notNull().default(0),
    note: text("note"),
    /** centre | home — where the sample is taken. Null until booked. */
    collectionMode: text("collection_mode"),
    /** When the sample is to be taken (booked slot). */
    scheduledAt: timestamp("scheduled_at"),
    /** For a home collection. */
    collectionAddress: text("collection_address"),
    /** Who takes the sample. */
    technician: text("technician"),
    /** The field technician who takes the sample (their own login). */
    technicianUserId: text("technician_user_id").references(() => user.id, { onDelete: "set null" }),
    /** The collection kit's unique code — three tubes and needles, one kit. */
    kitCode: text("kit_code"),
    /** The technician set out for a home collection. */
    onTheWayAt: timestamp("on_the_way_at"),
    /** Handed to the outside lab that runs the test. */
    sentToLabAt: timestamp("sent_to_lab_at"),
    /** Which outside lab. */
    externalLab: text("external_lab"),
    /** When that lab said the report would be ready. */
    expectedReportOn: date("expected_report_on"),
    /** The lab's own notes on the order. */
    labNote: text("lab_note"),
    orderedByUserId: text("ordered_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("blood_test_order_patient_id_idx").on(table.patientId)],
);

/** One marker on one order, at the price it carried that day. */
// Every step an order takes — booked, on the way, collected, sent to the lab,
// reported — with who did it and when. The order page's timeline.
export const bloodTestOrderEvent = pgTable(
  "blood_test_order_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => bloodTestOrder.id, { onDelete: "cascade" }),
    /** booked | on_the_way | collected | not_collected | sent_to_lab | reported | cancelled | note */
    kind: text("kind").notNull(),
    note: text("note"),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("blood_test_order_event_order_idx").on(table.orderId, table.createdAt)],
);

export const bloodTestOrderItem = pgTable(
  "blood_test_order_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id")
      .notNull()
      .references(() => bloodTestOrder.id, { onDelete: "cascade" }),
    biomarkerId: text("biomarker_id")
      .notNull()
      .references(() => biomarker.id, { onDelete: "restrict" }),
    /**
     * Copied at order time, for the same reason a receipt stores its own
     * number: editing the catalogue tomorrow must not rewrite what a patient
     * was charged today.
     */
    priceInPaise: integer("price_in_paise").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique("blood_test_order_item_unique").on(table.orderId, table.biomarkerId),
    index("blood_test_order_item_order_id_idx").on(table.orderId),
  ],
);

// A patient can have more than one address (home/work/other).
export const patientAddress = pgTable("patient_address", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  patientId: text("patient_id")
    .notNull()
    .references(() => patientRecord.id, { onDelete: "cascade" }),
  addressType: text("address_type").notNull().default("home"), // home | work | other
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  country: text("country").notNull().default("India"),
  pincode: text("pincode").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const report = pgTable("report", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /**
   * The chart this belongs to.
   *
   * A blood report is the patient's, and every patient has a chart the moment
   * a visit is booked — a login is optional and most walk-ins never get one.
   * This used to hang only off the account, which meant the clinic could not
   * file a lab printout for the majority of its own patients.
   */
  patientId: text("patient_id").references(() => patientRecord.id, {
    onDelete: "cascade",
  }),
  /**
   * The account, when there is one. Nullable now: it is how the patient reads
   * the report in their own app, not what makes the row legal. A report filed
   * before somebody signs up keeps its chart and gains the account later.
   */
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  // Which visit this report was collected for, when uploaded from an
  // appointment's own page — optional since patient self-uploads and older
  // rows have no appointment context.
  appointmentId: text("appointment_id").references(() => appointment.id, {
    onDelete: "set null",
  }),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  reportType: text("report_type"),
  // set null, not cascade: the report is the patient's record, not the
  // uploader's. Without a rule here Postgres defaults to NO ACTION, which made
  // every account that had ever uploaded a report undeletable — see 0016.
  uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
  // The day the sample was taken, which is not the day the PDF was uploaded.
  // A blood test can happen on any day — before a review, after one, or on no
  // appointment at all — and it may reach us a week later. The biological
  // clock plots a trend, and a trend dated by upload time is the wrong shape.
  collectedOn: date("collected_on"),
  /** The order this sheet fulfils. A lab may send more than one per draw. */
  bloodTestOrderId: text("blood_test_order_id").references(() => bloodTestOrder.id, {
    onDelete: "set null",
  }),
  uploadedAt: timestamp("uploaded_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
}, (table) => [
  index("report_user_id_uploaded_at_idx").on(table.userId, table.uploadedAt),
]);

// Anything the person handed the clinic: a PDF, a lab report, an X-ray, a photo.
// One list per contact, so the same files show on the lead, the patient chart
// and every appointment. appointmentId only records which visit it was filed from.
export const personDocument = pgTable(
  "person_document",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    appointmentId: text("appointment_id").references(() => appointment.id, { onDelete: "set null" }),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    // report | xray | image | pdf | other
    kind: text("kind").notNull().default("other"),
    note: text("note"),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("person_document_contact_created_idx").on(table.contactId, table.createdAt)],
);

// A note about the person, not about one visit. Appointment notes stay on the visit.
export const contactNote = pgTable(
  "contact_note",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    authorRole: text("author_role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("contact_note_contact_created_idx").on(table.contactId, table.createdAt)],
);

// Composite biological index, e.g. "Composite Biological LegAge Index (CBLAI)"
export const biomarkerIndex = pgTable("biomarker_index", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  shortCode: text("short_code").notNull().unique(),
  description: text("description"),
  // ΔAge scaling constant used as k in: ΔAge = Σ(k * α_d * Mean|Z|_d * W_d)
  k: doublePrecision("k").notNull().default(1),
  /**
   * Ordered risk bands for the composite score.
   *
   * Was three columns (normal/moderate/severe max) with a fourth band implied
   * above the last, which fixed both the count and the names. Indices do not
   * agree on either — see RiskBand in ./risk-bands.ts for the shape and the
   * rules the editor enforces.
   */
  riskBands: jsonb("risk_bands").notNull().default([]),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Domain, e.g. "Inflammation Risk Factor (IFR)"
export const biomarkerDomain = pgTable("biomarker_domain", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  shortCode: text("short_code").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Biomarker, e.g. "hs-CRP"
export const biomarker = pgTable("biomarker", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  shortCode: text("short_code").notNull(),
  description: text("description"),
  unit: text("unit"),
  rangeMin: doublePrecision("range_min"),
  rangeMax: doublePrecision("range_max"),
  // true = "Up" (higher value drives biological age up), false = "Down"
  direction: boolean("direction").notNull(),
  /**
   * What running this marker costs the patient.
   *
   * Per marker rather than one "blood test" fee, because the clinic picks
   * which markers to run and the total follows from that — a single fee would
   * be wrong the moment a panel changes. Zero until somebody sets it: what a
   * lab charges for CTX-II is a fact the clinic has, and a guess here would be
   * charged to a patient.
   */
  priceInPaise: integer("price_in_paise").notNull().default(0),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Which domains belong to which composite category — dynamic, many-to-many
export const indexDomainMap = pgTable(
  "index_domain_map",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    indexId: text("index_id")
      .notNull()
      .references(() => biomarkerIndex.id, { onDelete: "cascade" }),
    domainId: text("domain_id")
      .notNull()
      .references(() => biomarkerDomain.id, { onDelete: "cascade" }),
    /**
     * Risk bands for this domain's observed score (Mean|Z|_d × W_d) *within
     * this category* — thresholds are set per category, which is why they live
     * on the link and not on the domain.
     *
     * Ordered, contiguous, last band open-ended. Was three fixed columns, which
     * fixed both how many bands there are and what they are called. See
     * ./risk-bands.ts.
     */
    riskBands: jsonb("risk_bands").notNull().default([]),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [unique().on(table.indexId, table.domainId)],
);

// Which biomarkers belong to which domain — dynamic, many-to-many
export const domainBiomarkerMap = pgTable(
  "domain_biomarker_map",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    domainId: text("domain_id")
      .notNull()
      .references(() => biomarkerDomain.id, { onDelete: "cascade" }),
    biomarkerId: text("biomarker_id")
      .notNull()
      .references(() => biomarker.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [unique().on(table.domainId, table.biomarkerId)],
);

// A patient's measured value for a biomarker, from a given report. Append-only —
// the "latest value" for a biomarker is derived by querying, never overwritten.
export const biomarkerReading = pgTable("biomarker_reading", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /**
   * The chart this reading belongs to.
   *
   * A clinic types a lab's numbers in for a patient who has never opened the
   * app — the normal case, not the exception. This used to hang only off the
   * account, so those numbers had nowhere to go.
   */
  patientId: text("patient_id").references(() => patientRecord.id, {
    onDelete: "cascade",
  }),
  /** The account, when there is one — how the patient reads their own score. */
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  reportId: text("report_id").references(() => report.id, { onDelete: "set null" }),
  /**
   * When the blood was drawn, which is not when somebody typed it in.
   *
   * Comparing panels by entry time puts a back-dated report in the wrong order
   * against the one before it — and "compare with the last blood test" is the
   * whole point of keeping them.
   */
  collectedOn: date("collected_on"),
  /**
   * The blood test this value came out of.
   *
   * Without it two panels a week apart are two piles of numbers with no way
   * back to the report, the draw date, or what was paid for them.
   */
  bloodTestOrderId: text("blood_test_order_id").references(() => bloodTestOrder.id, {
    onDelete: "set null",
  }),
  biomarkerId: text("biomarker_id")
    .notNull()
    .references(() => biomarker.id, { onDelete: "cascade" }),
  value: doublePrecision("value").notNull(),
  recordedAt: timestamp("recorded_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// One saved calculation run for a patient against a category, dated — a new
// blood test produces a new row, history is never overwritten.
export const biologicalAgeResult = pgTable("biological_age_result", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** The chart. Every patient has one; a login is optional. */
  patientId: text("patient_id").references(() => patientRecord.id, {
    onDelete: "cascade",
  }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  indexId: text("index_id")
    .notNull()
    .references(() => biomarkerIndex.id, { onDelete: "cascade" }),
  reportId: text("report_id").references(() => report.id, { onDelete: "set null" }),
  // Snapshot at calculation time so historical rows stay accurate even if the
  // patient's date of birth is edited later.
  chronologicalAge: doublePrecision("chronological_age").notNull(),
  compositeScore: doublePrecision("composite_score").notNull(),
  deltaAge: doublePrecision("delta_age").notNull(),
  biologicalAge: doublePrecision("biological_age").notNull(),
  calculatedAt: timestamp("calculated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Per-domain breakdown for a saved result. Snapshots weight/alpha used at the
// time, so a later config change doesn't retroactively rewrite history.
export const domainAgeResult = pgTable("domain_age_result", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  resultId: text("result_id")
    .notNull()
    .references(() => biologicalAgeResult.id, { onDelete: "cascade" }),
  domainId: text("domain_id")
    .notNull()
    .references(() => biomarkerDomain.id, { onDelete: "cascade" }),
  meanAbsZ: doublePrecision("mean_abs_z").notNull(),
  biomarkerCount: integer("biomarker_count").notNull(),
  weightUsed: doublePrecision("weight_used").notNull(),
  alphaUsed: doublePrecision("alpha_used").notNull(),
  contribution: doublePrecision("contribution").notNull(),
});

// One chat thread for the patient-facing Predict AI assistant.
export const aiConversation = pgTable("ai_conversation", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
}, (table) => [
  index("ai_conversation_user_id_updated_at_idx").on(table.userId, table.updatedAt),
]);

// A single turn in an ai_conversation. Append-only.
export const aiMessage = pgTable("ai_message", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => aiConversation.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
}, (table) => [
  index("ai_message_conversation_id_created_at_idx").on(table.conversationId, table.createdAt),
]);

// Superadmin-editable settings for the Predict AI assistant. Exactly one row
// ever exists — updated in place, never a second row inserted. The actual
// OPENAI_API_KEY stays in env vars, never here — provider credentials are
// never stored in the database.
export const aiAssistantConfig = pgTable("ai_assistant_config", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  enabled: boolean("enabled").notNull().default(true),
  /** openai | google — see ./ai-providers.ts. Was inferred from the model name. */
  provider: text("provider").notNull().default("openai"),
  model: text("model").notNull().default("gpt-4o-mini"),
  temperature: doublePrecision("temperature").notNull().default(0.3),
  maxOutputTokens: integer("max_output_tokens").notNull().default(600),
  // Admin-editable ADDITION to the hard-coded system prompt (tone/extra
  // guidance only) — never the whole prompt. See apps/web/src/lib/ai/system-prompt.ts:
  // the core scope/refusal rule is compiled in code and always wraps this.
  additionalInstructions: text("additional_instructions").notNull().default(""),
  dailyMessageLimitPerUser: integer("daily_message_limit_per_user").notNull().default(50),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Unified lead→patient lifecycle entity. A visitor becomes a LEAD here; when
// they register (or are converted by staff) the *same row* gets userId set
// and status flips to PATIENT — never copied into a separate table, so
// message/automation history carries over across the conversion.
export const contact = pgTable(
  "contact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    // Normalized (E.164) at write time so the unique index below is a plain
    // lookup, not fuzzy matching.
    phone: text("phone"),
    // Normalized (lowercased) at write time, same reasoning as phone.
    email: text("email"),
    // Lifecycle position only — see ContactStage in ./contact-stage.ts.
    // A flow that wants to record a nurture outcome writes `engagement`,
    // never this, so "still a LEAD" survives being nurtured.
    stage: text("stage").notNull().default("LEAD"),
    // Nurture state, independent of stage (a LEAD can be LONG_TERM).
    engagement: text("engagement"),
    // Acquisition attribution — kept as plain nullable strings (no lookup
    // tables) so new campaigns/sources never need a migration.
    source: text("source"), // e.g. PREDICT | IN_CLINIC | SOCIAL_MEDIA
    sourcePlatform: text("source_platform"), // e.g. INSTAGRAM, FACEBOOK
    campaign: text("campaign"),
    campaignId: text("campaign_id"),
    referralCode: text("referral_code"),
    firstTouchAt: timestamp("first_touch_at"),
    lastTouchAt: timestamp("last_touch_at"),
    score: doublePrecision("score"),
    // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
    clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
    // Lead routing — see drizzle/0048_lead_routing.sql and ./lead-routing.ts.
    assignedUserId: text("assigned_user_id").references(() => user.id, { onDelete: "set null" }),
    assignedRole: text("assigned_role"),
    assignedAt: timestamp("assigned_at"),
    leadStatus: text("lead_status").default("NEW"), // see ./lead-status.ts
    leadStatusAt: timestamp("lead_status_at"),
    callbackAt: timestamp("callback_at"),
    // Sweep markers — see drizzle/0054_automation_settings.sql. Each one is
    // set when the sweep acts, so a check that runs every minute reminds
    // somebody exactly once.
    callbackRemindedAt: timestamp("callback_reminded_at"),
    firstResponseEscalatedAt: timestamp("first_response_escalated_at"),
    assignmentNotifiedAt: timestamp("assignment_notified_at"),
    interest: text("interest"), // knee_pain, back_pain ... from lead_rule
    city: text("city"),
    // A user can back at most one contact — enforced unique, not just FK.
    userId: text("user_id")
      .unique()
      .references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("contact_phone_unique")
      .on(table.phone)
      .where(sql`${table.phone} is not null`),
    uniqueIndex("contact_email_unique")
      .on(table.email)
      .where(sql`${table.email} is not null`),
  ],
);

// A booked visit/consultation. Staff create these (in-clinic booking, phone
// booking, tele-consult scheduling) — this is what a flow's Condition node
// checks for "Appointment Booked?" branching, and what emits
// APPOINTMENT_CREATED/CONFIRMED/COMPLETED for flows to react to.
export const appointment = pgTable("appointment", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
  clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
  contactId: text("contact_id")
    .notNull()
    .references(() => contact.id, { onDelete: "cascade" }),
  doctorUserId: text("doctor_user_id").references(() => user.id, { onDelete: "set null" }),
  type: text("type").notNull().default("consultation"), // consultation | review — see ./visit-kind.ts
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled | confirmed | in_consultation | completed | cancelled | no_show
  notes: text("notes"),
  // What this visit is charged, in paise. Copied from the clinic default when
  // the booking is made and editable per appointment — concessions happen, and
  // the front desk should not have to ask anyone. The doctor cannot see the
  // visit until this is settled; see visibleToClinicians in ./visit-workflow.
  feeInPaise: integer("fee_in_paise").notNull().default(DEFAULT_CONSULTATION_FEE_PAISE),
  // The course this visit belongs to, if any. A therapy day gets it from its
  // sitting; a mid-course review consultation has no sitting — it does not
  // consume one of the days the patient paid for — so this is the only thing
  // that puts it on the course timeline.
  enrollmentId: text("enrollment_id"),
  /**
   * When the patient physically turned up. Null until they do.
   *
   * Deliberately not a `status` value: confirmation and arrival are
   * independent — an online booking is confirmed days before anybody walks
   * in, a walk-in arrives having confirmed nothing — and one enum cannot
   * hold two facts without one erasing the other. See ./arrival.ts.
   */
  arrivedAt: timestamp("arrived_at"),
  // Cal.com's booking uid (POST /v2/bookings data.uid) — null for
  // legacy/manually-created appointments that never went through Cal.com.
  calBookingUid: text("cal_booking_uid").unique(),
  // virtual | in_clinic — how this visit happens. Independent of `type`
  // above (the visit kind). Null for legacy rows predating this field.
  channel: text("channel"),
  // The Google Meet URL (virtual) or clinic address (in_clinic), taken
  // verbatim from Cal.com's booking response and shown to the patient as-is.
  meetingLocation: text("meeting_location"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// The doctor's recurring weekly availability, by weekday — the source the
// automation flow's "Send Available Dates"/"Send Available Time Slots"
// nodes compute open slots from (a template row minus the appointments
// already booked against it). Not a calendar of concrete slots: one row
// covers that weekday every week until isActive is flipped off.
export const doctorAvailability = pgTable("doctor_availability", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
  clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
  doctorUserId: text("doctor_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // 0 = Sunday .. 6 = Saturday, matching JS Date#getDay().
  dayOfWeek: integer("day_of_week").notNull(),
  // "HH:MM" 24h local clinic time. Stored as text, not a time column, so the
  // `${startTime}-${endTime}` slot id sent to the patient as a WhatsApp list
  // option round-trips back byte-identical on their reply.
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  // How long one appointment is. The window is a working period, not a
  // single booking: 09:00-13:00 at 30 minutes is eight slots, not one.
  slotMinutes: integer("slot_minutes").notNull().default(30),
  // How many patients can hold the SAME slot — a doctor who sees two at once.
  capacity: integer("capacity").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Days a doctor is not working, on top of the weekly template.
//
// Leave is not the absence of a template row: the template says "Tuesdays,
// 9 to 1", and a doctor taking next Tuesday off must not have to delete
// Tuesdays and put them back afterwards. Kept as its own dated exception so
// the weekly pattern stays intact.
export const doctorTimeOff = pgTable(
  "doctor_time_off",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
    clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
    doctorUserId: text("doctor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Inclusive both ends, so a single day is the same date twice.
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    // Null on both means the whole day. Set them for a half day — a doctor
    // leaving at noon should not have to book the afternoon off as a day.
    startTime: text("start_time"),
    endTime: text("end_time"),
    reason: text("reason"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("doctor_time_off_doctor_idx").on(table.doctorUserId, table.startDate)],
);

// A running log of clinical/staff notes on a visit — separate from
// `appointment.notes` (the single note captured at booking time). Each
// entry keeps a snapshot of the author's role at the time it was written,
// so the log stays accurate even if that person's role changes later.
export const appointmentNote = pgTable("appointment_note", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  appointmentId: text("appointment_id")
    .notNull()
    .references(() => appointment.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  authorRole: text("author_role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// A to-do for a staff member, created by a flow's "Create Task" node (e.g.
// "Day 5: Health Coach Direct Call", "Day 21: Doctor review") — the
// human-in-the-loop step automation can't do by itself.
export const task = pgTable("task", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
  clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
  contactId: text("contact_id")
    .notNull()
    .references(() => contact.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // e.g. health_coach_call | doctor_review | follow_up
  title: text("title").notNull(),
  notes: text("notes"),
  // Assign to a role (any staff with that role can pick it up) or a
  // specific person — at least one should be set.
  assignedRole: text("assigned_role"), // doctor | health_coach | admin
  assignedUserId: text("assigned_user_id").references(() => user.id, { onDelete: "set null" }),
  // Who raised it. Null means automation did — a flow's Create Task node has
  // no person behind it, and the run below is the honest answer to "why does
  // this task exist?".
  createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  // The automation run that raised it, when one did. Plain text rather than a
  // foreign key, matching communicationMessage.runId: a run can be pruned
  // without taking the task it produced with it.
  createdByRunId: text("created_by_run_id"),
  dueAt: timestamp("due_at"),
  status: text("status").notNull().default("open"), // open | done | cancelled
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// The clinic's own list of things it prescribes — the pick-list behind every
// assignment, maintained once in Setup instead of retyped per patient.
//
// Separate from care_plan_item because they answer different questions: this
// is "what do we prescribe", that is "what is THIS patient on". Assigning
// copies the name across rather than pointing at it, so renaming a catalogue
// entry later cannot silently rewrite what a patient was already told.
// The clinic's library of dietary protocols (drizzle/0073). A protocol here is
// a starting point: assigning it copies it onto the patient, where the
// nutritionist adjusts it — editing the library never changes a patient's plan.
export const dietProtocolTemplate = pgTable(
  "diet_protocol_template",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    diet: text("diet"), // veg | egg | nonveg — null when it suits any
    protocol: jsonb("protocol").notNull(), // DietProtocol, see ./diet-protocol.ts
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("diet_protocol_template_active_idx").on(table.isActive, table.name)],
);

// The clinic's library of exercise prescriptions — written once, copied onto a
// patient from their Exercise tab. See ./exercise-protocol-library.ts.
export const exerciseProtocolTemplate = pgTable(
  "exercise_protocol_template",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    protocol: jsonb("protocol").notNull(), // ExerciseProtocol, see ./exercise-protocol.ts
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("exercise_protocol_template_active_idx").on(table.isActive, table.name)],
);

// Each daily check-in's switch and send time (IST). No row = on, at 9:00.
// See ./checkin-settings.ts.
export const checkinSetting = pgTable("checkin_setting", {
  kind: text("kind").primaryKey(), // medicine | exercise | diet
  enabled: boolean("enabled").notNull().default(true),
  sendHour: integer("send_hour").notNull().default(9),
  sendMinute: integer("send_minute").notNull().default(0),
  updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// The daily check-ins — did the patient take their medicine, do their
// exercises, follow their diet — one row per patient per kind per day, from
// the WhatsApp check-in's buttons (or entered by staff). See ./checkin.ts.
export const checkinLog = pgTable(
  "checkin_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    /** medicine | exercise | diet */
    kind: text("kind").notNull().default("exercise"),
    /** The day the answer is about (IST), not the day it came. */
    forDate: date("for_date").notNull(),
    /** One of CHECKINS[kind].options[].value */
    response: text("response").notNull(),
    /** whatsapp | staff */
    source: text("source").notNull().default("whatsapp"),
    /** The check-in message the answer was a reply to. */
    messageId: text("message_id"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("checkin_log_contact_kind_day_unique").on(table.contactId, table.kind, table.forDate)],
);

export const carePlanCatalogItem = pgTable(
  "care_plan_catalog_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // supplement | medication | exercise | diet — see CarePlanItemType.
    type: text("type").notNull(),
    name: text("name").notNull(),
    // Pre-filled into the assignment, still editable per patient: the same
    // supplement is genuinely taken differently by different people.
    defaultInstructions: text("default_instructions"),
    defaultSlots: jsonb("default_slots").notNull().default([]),
    // Retired entries stop appearing in the picker but stay resolvable from
    // the plans that already reference them.
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("care_plan_catalog_item_type_idx").on(table.type, table.isActive),
    // One entry per name per type, so re-running the seed or adding a
    // duplicate by hand cannot fill the picker with the same thing twice.
    uniqueIndex("care_plan_catalog_item_type_name_unique").on(table.type, table.name),
  ],
);

// What a patient has actually been told to take or do — the thing an
// adherence log is adherence *to*.
//
// Without this, adherence_log could only ever say "medication: done", never
// which medication, how much, or who prescribed it, so nothing could be
// computed from it: no percentage, no missed-dose, no trend. The plan supplies
// the denominator.
//
// Assigned by a doctor, health coach or nutritionist — assignedRole records
// which, because the three prescribe different things and a coach should not
// silently appear to have changed a doctor's medication.
export const carePlanItem = pgTable(
  "care_plan_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    // supplement | medication | exercise | diet — see CarePlanItemType in
    // ./care-plan.ts. Free text for the same reason as contact.source: a new
    // category should not need a migration.
    type: text("type").notNull(),
    // Where this came from in the catalogue, for reporting. Nullable: a
    // clinician can still prescribe something off-list, and rows predating
    // the catalogue have none.
    catalogItemId: text("catalog_item_id").references(() => carePlanCatalogItem.id, {
      onDelete: "set null",
    }),
    // Snapshot, not a lookup — see the note on care_plan_catalog_item.
    name: text("name").notNull(), // "Vitamin D3 5000 IU", "Knee extension x15"
    instructions: text("instructions"), // "after breakfast, with water"
    // Which times of day this is due — ["morning","evening"]. Its length is
    // the expected doses per day, which is what every adherence percentage
    // divides by.
    slots: jsonb("slots").notNull().default([]),
    assignedByUserId: text("assigned_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    assignedRole: text("assigned_role"), // doctor | health_coach | nutritionist
    startDate: date("start_date").notNull(),
    // Null means open-ended. Set it to stop counting the item against
    // adherence rather than deleting it, so history stays truthful.
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("care_plan_item_contact_active_idx").on(table.contactId, table.isActive)],
);

// Patient-reported (or staff-logged) adherence entries — "Medication
// Adherence Log", "Daily Exercise Compliance Log", "Diet & Nutrition Plan
// Log" from the review-loop audits. Append-only, like biomarkerReading.
export const adherenceLog = pgTable(
  "adherence_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    // Which prescribed item this is about. Nullable: rows predating the care
    // plan have no item, and a patient can still report "took my meds"
    // without naming one. Those count as activity but not toward any item's
    // percentage — there is nothing to divide by.
    carePlanItemId: text("care_plan_item_id").references(() => carePlanItem.id, {
      onDelete: "set null",
    }),
    logType: text("log_type").notNull(), // medication | exercise | diet
    // morning | afternoon | evening. Null on free-form entries.
    slot: text("slot"),
    // The day this counts *for*, which is not when it was recorded: an evening
    // dose logged at 00:20 belongs to the previous day, and a coach catching up
    // backfills yesterday. Storing only loggedAt would silently move both.
    loggedForDate: date("logged_for_date"),
    status: text("status").notNull(), // done | missed | partial — kept loose on purpose
    note: text("note"),
    source: text("source").notNull().default("whatsapp"), // whatsapp | web | staff
    loggedAt: timestamp("logged_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("adherence_log_contact_date_idx").on(table.contactId, table.loggedForDate),
    // One entry per item per slot per day — a re-report corrects the existing
    // row instead of inflating the count above what was prescribed.
    uniqueIndex("adherence_log_item_slot_day_unique")
      .on(table.carePlanItemId, table.slot, table.loggedForDate)
      .where(sql`${table.carePlanItemId} is not null and ${table.loggedForDate} is not null`),
  ],
);

// ── Treatment plans ────────────────────────────────────────────────────────
//
// See ./treatment-plan.ts for why a sitting plan, and not an attended
// consultation, is what makes somebody a patient.

// What the clinic sells: limbs × days, priced. Maintained on the Treatment
// Plans settings page rather than in this file, because repricing a 21-day
// four-limb course is a Tuesday, not a deploy.
export const treatmentPlan = pgTable(
  "treatment_plan",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    // two | four — see PlanLimbs. Text, not an enum, so a three-limb or
    // spine-only package later is a row rather than a migration.
    limbs: text("limbs").notNull(),
    durationDays: integer("duration_days").notNull(),
    // Usually equal to durationDays. Separate because a 42-day course that is
    // six weeks of alternate days is a real thing to sell, and the schedule
    // has to be built from the number of sessions, not the length of the span.
    sittings: integer("sittings").notNull(),
    // Paise. Integer money — a plan priced 24999.99 by floating point is the
    // kind of bug that reaches an invoice.
    priceInPaise: integer("price_in_paise").notNull().default(0),
    // How much of the plan has to be in before the sittings can start. Part
    // payment is allowed above this and refused below it — a course that began
    // on nothing is one the clinic has already delivered for free.
    advancePercent: integer("advance_percent").notNull().default(0),
    /**
     * Sold one session at a time rather than as a course.
     *
     * priceInPaise is then the price of ONE session, and sittings means
     * nothing — a walk-in takes as many as they take. See ./walk-in.ts.
     */
    isPerSession: boolean("is_per_session").notNull().default(false),
    description: text("description"),
    // Retired plans stop appearing in the picker but stay resolvable from the
    // enrolments that already reference them.
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("treatment_plan_active_idx").on(table.isActive, table.sortOrder),
    // One plan per shape, so the picker cannot fill up with three identical
    // "Four limbs 21 day" entries nobody can tell apart.
    uniqueIndex("treatment_plan_shape_unique").on(table.limbs, table.durationDays, table.name),
  ],
);

// One line of a plan's bill — see PlanItemKind in ./treatment-plan.ts.
//
// Split out of treatment_plan because a plan is a bill, not a price. The
// clinic's sheet lists five lines per package, each with a rate and a
// quantity, and the quantities are the part the patient is actually handed:
// ten sachets on a 6-day course, fifty on a 42-day one. A single price column
// loses all of that and cannot be reconciled against what was dispensed.
export const treatmentPlanItem = pgTable(
  "treatment_plan_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    planId: text("plan_id")
      .notNull()
      .references(() => treatmentPlan.id, { onDelete: "cascade" }),
    // medicine | treatment. Exactly one treatment line per plan: its quantity
    // is the number of sittings, which is what the log sheet lays out.
    kind: text("kind").notNull().default("medicine"),
    // The stock item this line dispenses. Nullable: a treatment line is not a
    // medicine, and a line can name something not stocked. SET NULL so
    // retiring a medicine cannot delete the package it was part of.
    medicineId: text("medicine_id").references(() => medicine.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    rateInPaise: integer("rate_in_paise").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("treatment_plan_item_plan_idx").on(table.planId, table.sortOrder)],
);

// A patient on a course. Hangs off contact, not user: an offline patient has a
// chart and a course long before they ever have a login, and keying this to
// the login would make their treatment invisible until they registered.
export const planEnrollment = pgTable(
  "plan_enrollment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
    clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    // Nullable and SET NULL: a plan can be retired or deleted after somebody
    // has been sold it, and losing the enrolment with it would erase treatment
    // that actually happened.
    treatmentPlanId: text("treatment_plan_id").references(() => treatmentPlan.id, {
      onDelete: "set null",
    }),
    // Snapshot of what they bought, at the price they paid. Repricing the
    // catalogue must never rewrite what an existing patient was charged, and
    // shortening a plan must never change how many sittings they are owed.
    planName: text("plan_name").notNull(),
    limbs: text("limbs").notNull(),
    durationDays: integer("duration_days").notNull(),
    sittings: integer("sittings").notNull(),
    priceInPaise: integer("price_in_paise").notNull().default(0),
    /**
     * Taken off the package at the desk or by the doctor — what the patient
     * was actually offered. The bill is the package lines less this; see
     * enrollmentBill() in ./treatment-plan.ts. See drizzle/0083.
     */
    discountInPaise: integer("discount_in_paise").notNull().default(0),
    /** Set when the discount was given as a percentage, to show it as given. */
    discountPercent: doublePrecision("discount_percent"),
    discountReason: text("discount_reason"),
    // Snapshotted with the price: raising the advance next month must not
    // retrospectively put a patient who already started into arrears.
    advancePercent: integer("advance_percent").notNull().default(0),
    /**
     * Open-ended: sessions are added as they happen, and `sittings` and
     * `priceInPaise` grow with them rather than being fixed up front.
     *
     * Snapshotted like the price, so editing the catalogue cannot turn a
     * course somebody bought into something else.
     */
    isPerSession: boolean("is_per_session").notNull().default(false),
    /**
     * How many of `sittings` the clinic gives free, on top of the plan's —
     * no charge, and no medicine taken for them. See drizzle/0093.
     */
    freeSittings: integer("free_sittings").notNull().default(0),
    // Null until the advance is paid and the course is activated — a
    // prescribed plan has no schedule yet, which is exactly the difference.
    startDate: date("start_date"),
    // active | completed | cancelled — see EnrollmentStatus.
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    enrolledByUserId: text("enrolled_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // The visit at which the doctor prescribed this. Ties the course back to
    // the assessment that justified it.
    prescribedAtAppointmentId: text("prescribed_at_appointment_id").references(
      () => appointment.id,
      { onDelete: "set null" },
    ),
    prescribedByUserId: text("prescribed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    activatedAt: timestamp("activated_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("plan_enrollment_contact_idx").on(table.contactId, table.status)],
);

// The bill as it was on the day this patient bought it — one row per line,
// copied from the plan and never re-read from it.
//
// Snapshotting the lines and not just the total is what makes a patient's
// paperwork answerable a year later: how many sachets they were given, at what
// rate, and what the treatment cost per sitting. Repricing the catalogue must
// not change any of it.
//
// isExtra covers the note at the bottom of the clinic's own sheet — "if your
// body requires extra medicine then you have to buy extra flat cost". Those
// lines are added after enrolment and were never part of the package, so they
// are marked rather than mixed in, and the package price stays quotable.
export const planEnrollmentItem = pgTable(
  "plan_enrollment_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => planEnrollment.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("medicine"),
    // Carried from the plan line so a patient's own bill still points at the
    // stock item — that is what makes "who has this medicine" answerable.
    medicineId: text("medicine_id").references(() => medicine.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    rateInPaise: integer("rate_in_paise").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),
    /** Dispensed on top of the package, at flat cost. */
    isExtra: boolean("is_extra").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    addedByUserId: text("added_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("plan_enrollment_item_enrollment_idx").on(table.enrollmentId, table.sortOrder)],
);

// One day of a course — the log sheet, one row per line.
//
// In-clinic and at-home sittings are the same row on purpose. "Did day 9
// happen?" is one question, and answering it from an appointments table for
// some patients and a home log for others is how two screens end up disagreeing
// about the same day.
export const planSitting = pgTable(
  "plan_sitting",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => planEnrollment.id, { onDelete: "cascade" }),
    // Denormalised from the enrolment so "this patient's therapy history"
    // survives an enrolment being deleted and can be queried without a join.
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    // 1-based. What the patient calls it: "I missed day 3".
    dayNumber: integer("day_number").notNull(),
    plannedDate: date("planned_date").notNull(),
    // in_clinic | at_home — see SittingMode. Set per day, not per plan.
    mode: text("mode").notNull().default("in_clinic"),
    // pending | done | missed — see SittingStatus.
    status: text("status").notNull().default("pending"),
    // The visit this day was booked as, when it is an in-clinic sitting.
    // SET NULL rather than cascade: deleting a booking must not delete the
    // record that the therapy day existed.
    appointmentId: text("appointment_id").references(() => appointment.id, {
      onDelete: "set null",
    }),
    // When it actually happened, which is not always the planned date.
    completedAt: timestamp("completed_at"),
    // patient | staff — see SittingSource. A patient's own tick on a home
    // therapy day is weaker evidence than a therapist's, and the difference
    // has to survive into any report built on this.
    loggedSource: text("logged_source"),
    loggedByUserId: text("logged_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    /**
     * The patient's signature for this sitting, as the paper log sheet had
     * them sign each day. PNG data URL from the signature pad; null for a
     * sitting logged before signatures were taken. See drizzle/0088.
     */
    signatureDataUrl: text("signature_data_url"),
    signedName: text("signed_name"),
    signedAt: timestamp("signed_at"),
    /** Given free, beyond the paid sittings — takes no medicine. See drizzle/0093. */
    isFree: boolean("is_free").notNull().default(false),
    /** The therapy-calendar booking this sitting was the visit for, if any. */
    bookingId: text("booking_id"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("plan_sitting_contact_date_idx").on(table.contactId, table.plannedDate),
    index("plan_sitting_enrollment_idx").on(table.enrollmentId, table.dayNumber),
    // Day 7 exists once per course. Without this a double-submitted enrolment
    // form silently doubles somebody's sittings.
    uniqueIndex("plan_sitting_enrollment_day_unique").on(table.enrollmentId, table.dayNumber),
  ],
);

// ── Therapy calendar ─────────────────────────────────────────────────────
//
// Therapy is booked by the hour, not by doctor or therapist: the clinic has so
// many beds an hour, and a patient who calls is told which hours have room.
// A booking is only a reservation — the sitting itself is written when the
// patient actually comes (plan_sitting), so a no-show or a Sunday never moves
// anybody's course. See ./therapy-calendar.ts and drizzle/0088.

/** Opening hours and beds per hour, one row per clinic. */
export const therapySchedule = pgTable("therapy_schedule", {
  clinicId: text("clinic_id")
    .primaryKey()
    .references(() => clinic.id, { onDelete: "cascade" }),
  /** First and last bookable hour, clinic time (24h). 10 and 18 = 10:00 … 18:00. */
  openHour: integer("open_hour").notNull().default(10),
  lastHour: integer("last_hour").notNull().default(18),
  /** How many patients can be treated in one hour. */
  capacity: integer("capacity").notNull().default(3),
  /** Weekdays the clinic gives no therapy, 0 = Sunday — e.g. "0". */
  closedWeekdays: text("closed_weekdays").notNull().default("0"),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

/** A festival or other one-off day without therapy. */
export const therapyClosedDay = pgTable(
  "therapy_closed_day",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("therapy_closed_day_unique").on(table.clinicId, table.day)],
);

/** One patient in one hour. booked → attended (sitting logged) | cancelled | no_show. */
export const therapyBooking = pgTable(
  "therapy_booking",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    /** The course the hour is for, when the patient has one. */
    enrollmentId: text("enrollment_id").references(() => planEnrollment.id, { onDelete: "set null" }),
    /** The start of the hour (UTC wall clock, as every timestamp here). */
    startsAt: timestamp("starts_at").notNull(),
    status: text("status").notNull().default("booked"),
    /** The sitting logged against this booking, once the patient came. */
    sittingId: text("sitting_id").references(() => planSitting.id, { onDelete: "set null" }),
    /** Who gives the therapy in that hour. One patient per therapist per hour. */
    therapistId: text("therapist_id").references(() => therapist.id, { onDelete: "set null" }),
    note: text("note"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("therapy_booking_clinic_start_idx").on(table.clinicId, table.startsAt),
    index("therapy_booking_contact_idx").on(table.contactId, table.startsAt),
  ],
);

// Money taken at the front desk — see ./payment.ts for the vocabulary.
//
// One table for both the consultation fee and treatment plan instalments,
// because they are the same act (somebody handed money over, somebody recorded
// it) and a single ledger per patient is what the desk actually reads. Which
// one it was is the kind column, and exactly one of appointmentId /
// enrollmentId is set.
// The clinic's own details, as they print on a receipt. Exactly one row, id
// "default", updated in place. In the database rather than in code because an
// address and a GSTIN on a financial document are facts about a business, not
// constants a developer should be guessing at.
export const clinicProfile = pgTable("clinic_profile", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("OPTM"),
  legalName: text("legal_name"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  /** Printed only when set — a blank tax field on a bill invites questions. */
  gstin: text("gstin"),
  registrationNo: text("registration_no"),
  footerNote: text("footer_note"),
  /** Printed above the signature pad at the foot of every clinical form. */
  consentText: text("consent_text"),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// One counter per financial year. See nextReceiptNo in ./receipt.ts.
export const receiptCounter = pgTable("receipt_counter", {
  financialYear: text("financial_year").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});

/** Per clinic, per financial year — what nextReceiptNo draws from. Replaces receiptCounter. */
export const clinicReceiptCounter = pgTable(
  "clinic_receipt_counter",
  {
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    financialYear: text("financial_year").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.clinicId, table.financialYear] })],
);

export const payment = pgTable(
  "payment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
    clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    // consultation | treatment_plan | blood_test | medicine — see PaymentKind.
    kind: text("kind").notNull(),
    // The fee this settles. SET NULL rather than cascade: deleting a booking
    // must not erase the record that money changed hands.
    appointmentId: text("appointment_id").references(() => appointment.id, {
      onDelete: "set null",
    }),
    enrollmentId: text("enrollment_id").references(() => planEnrollment.id, {
      onDelete: "set null",
    }),
    /** A blood test, so what the lab work cost shows up in Billing too. */
    bloodTestOrderId: text("blood_test_order_id").references(() => bloodTestOrder.id, {
      onDelete: "set null",
    }),
    // The medicine bill this pays — at the counter, or later against what was
    // left owing. Not a target in the one-target rule: a medicine payment may
    // also carry the visit it was bought at.
    medicineSaleId: text("medicine_sale_id").references(() => medicineSale.id, { onDelete: "set null" }),
    amountInPaise: integer("amount_in_paise").notNull(),
    // cash | card | upi | bank | other — see PaymentMethod.
    method: text("method").notNull().default("cash"),
    /** UPI reference, card slip number, whatever was written on the receipt. */
    reference: text("reference"),
    note: text("note"),
    // Voided rather than deleted: a payment entered against the wrong patient
    // is a mistake somebody has to be able to see afterwards, and a receipt
    // that vanishes is worse than one marked cancelled.
    /**
     * The number on the paper the patient was handed.
     *
     * Stored rather than computed from this row's position: voiding one
     * payment would otherwise renumber every receipt after it, including
     * ones already printed. Sequential per financial year — see ./receipt.ts
     * for why that is not random.
     */
    receiptNo: text("receipt_no"),
    voidedAt: timestamp("voided_at"),
    voidReason: text("void_reason"),
    collectedByUserId: text("collected_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    collectedAt: timestamp("collected_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("payment_contact_idx").on(table.contactId, table.collectedAt),
    index("payment_appointment_idx").on(table.appointmentId),
    index("payment_enrollment_idx").on(table.enrollmentId),
  ],
);

// One filled-in clinical form: registration, questionnaire, measurements,
// provisional diagnosis, nutrition consult.
//
// Answers are JSONB against a form definition that lives in code, not columns
// per question. These forms are paper documents the clinic revises, and a new
// question must be an edit to a definition rather than a migration — otherwise
// the schema grows a column every time a form is reprinted, and old
// submissions grow nulls that cannot be told apart from "not answered".
//
// The definition is versioned onto the row, so a submission always renders
// against the form as it was when it was filled in.
export const clinicalFormSubmission = pgTable(
  "clinical_form_submission",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    // The visit this belongs to. Nullable so a form can be filled outside a
    // booking, but normally set — the workflow reads per appointment.
    appointmentId: text("appointment_id").references(() => appointment.id, {
      onDelete: "cascade",
    }),
    /** Which form — see CLINICAL_FORMS in ./clinical-forms.ts. */
    formKey: text("form_key").notNull(),
    formVersion: integer("form_version").notNull().default(1),
    answers: jsonb("answers").notNull().default({}),
    // draft | submitted. A half-filled form is saved, not lost, when the
    // receptionist is interrupted — but only a submitted one advances the
    // workflow.
    status: text("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at"),
    submittedByUserId: text("submitted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /**
     * The wording that was on screen when they signed.
     *
     * Copied in rather than pointed at: the clinic can reword its consent,
     * and every signature already taken was given against the words shown at
     * the time. A reference would silently rewrite what people agreed to.
     */
    consentText: text("consent_text"),
    consentGiven: boolean("consent_given").notNull().default(false),
    /** A PNG data URL from the signature pad. */
    signatureDataUrl: text("signature_data_url"),
    /** Not always the patient — a parent, a guardian, an attendant. */
    signedName: text("signed_name"),
    signedAt: timestamp("signed_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("clinical_form_contact_idx").on(table.contactId, table.formKey),
    // One of each form per visit. Without this a double-submitted page becomes
    // two answers to the same questions and nothing can say which is current.
    uniqueIndex("clinical_form_visit_key_unique")
      .on(table.appointmentId, table.formKey)
      .where(sql`${table.appointmentId} is not null`),
  ],
);

// ── Medicine stock ─────────────────────────────────────────────────────────

// What the clinic dispenses and consumes, as a thing rather than a name.
//
// Medicines lived only as free text on treatment_plan_item — "Phyto Proflex"
// typed once per package — so nothing could count them, price them, or tell you
// there were four sachets left. This is the canonical item; the plan lines point
// at it.
export const medicine = pgTable(
  "medicine",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    /** The clinic's own code, if it uses one. */
    sku: text("sku"),
    // tablet | capsule | sachet | bottle | tube | ml | gram | piece.
    unit: text("unit").notNull().default("piece"),
    /**
     * A combo is packaging, not a thing on a shelf.
     *
     * "(2 BHT + LL + NPF-1) Combo" is how a patient is billed and handed their
     * medicine, but the storeroom counts BHT, LL and NPF-1 separately — one
     * combo drawing on three different tins. A kit therefore holds no stock of
     * its own; what it expands to does. See medicineComponent.
     */
    isKit: boolean("is_kit").notNull().default(false),
    /**
     * What one unit sells for at the counter, in paise. A package bills its
     * own rate per line (a 30-day course is cheaper per unit than a 7-day
     * one), so this is the price of the medicine on its own. 0 = not set.
     * See drizzle/0087.
     */
    rateInPaise: integer("rate_in_paise").notNull().default(0),
    /**
     * How much of this one therapy session uses.
     *
     * Null means it is not consumed per session — it is handed over as a pack
     * and used at home. Only medicines with a number here appear in the
     * forecast, because only they draw on clinic stock as therapy happens.
     */
    perSittingQty: doublePrecision("per_sitting_qty"),
    /** Warn at or below this. Zero means never warn. */
    reorderLevel: doublePrecision("reorder_level").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("medicine_name_unique").on(table.name)],
);

// What a combo is made of.
//
// The plan line still names the combo — that is what the patient is sold and
// handed. Stock is counted on the components, because that is what is bought,
// stored and runs out: one combo takes two BHT, one LL and one NPF-1 off three
// different shelves.
export const medicineComponent = pgTable(
  "medicine_component",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    kitId: text("kit_id")
      .notNull()
      .references(() => medicine.id, { onDelete: "cascade" }),
    // RESTRICT, not cascade: deleting a medicine that something is made of
    // would quietly change what that combo contains.
    componentId: text("component_id")
      .notNull()
      .references(() => medicine.id, { onDelete: "restrict" }),
    /** How many of the component one of the kit contains. */
    quantity: doublePrecision("quantity").notNull().default(1),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // One line per component per kit — listing BHT twice would double it
    // silently rather than saying 2.
    uniqueIndex("medicine_component_unique").on(table.kitId, table.componentId),
  ],
);

// Every movement in or out. What is on hand is the sum of these, never a
// column somebody increments.
//
// A mutable stock counter and a movement history disagree the first time an
// update is missed or applied twice, and the disagreement is silent — you find
// it during a physical count months later with no way to say which entry was
// wrong. The ledger cannot drift from itself.
export const stockMovement = pgTable(
  "stock_movement",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    medicineId: text("medicine_id")
      .notNull()
      .references(() => medicine.id, { onDelete: "cascade" }),
    // opening | purchase | dispense | consumption | adjustment | return | expiry
    kind: text("kind").notNull(),
    /**
     * Signed: positive comes in, negative goes out. One column rather than
     * separate in/out ones so the balance is a plain sum and nothing has to
     * remember which way each kind points.
     */
    quantity: doublePrecision("quantity").notNull(),
    // Who it went to and why — set on a dispense or a consumption, so "where
    // did forty sachets go" is answerable without a stock take.
    /** Whose shelf: each clinic counts its own stock. See drizzle/0098_stock_per_clinic.sql. */
    clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "set null" }),
    enrollmentId: text("enrollment_id").references(() => planEnrollment.id, {
      onDelete: "set null",
    }),
    // The therapy day that consumed it. Unique below: marking day 9 done twice
    // must not take the stock twice.
    sittingId: text("sitting_id").references(() => planSitting.id, { onDelete: "set null" }),
    batchNo: text("batch_no"),
    expiresOn: date("expires_on"),
    /** What a unit cost, on a purchase. Paise, like every other amount here. */
    unitCostInPaise: integer("unit_cost_in_paise"),
    note: text("note"),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("stock_movement_medicine_idx").on(table.medicineId, table.occurredAt),
    // One consumption per medicine per therapy day. Re-marking a sitting done
    // after a correction must not draw the stock down a second time.
    uniqueIndex("stock_movement_sitting_medicine_unique")
      .on(table.sittingId, table.medicineId)
      .where(sql`${table.sittingId} is not null`),
  ],
);

// Immutable domain-event log — never mutated after insert. One event can
// legitimately fan out to several independent automation flows, so there is
// no "processed" flag here; per-flow processing state lives separately
// (in the flow engine's own trigger-execution table, added alongside it).
export const lifecycleEvent = pgTable(
  "lifecycle_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: text("type").notNull(), // DomainEventType, e.g. PATIENT_REGISTERED
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    payload: text("payload").notNull().default("{}"), // JSON-encoded
    occurredAt: timestamp("occurred_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    // Lets a caller safely emit the "same" event more than once (e.g. a
    // retried webhook) without creating a duplicate — nullable because not
    // every event has a natural dedup key.
    idempotencyKey: text("idempotency_key"),
  },
  (table) => [
    uniqueIndex("lifecycle_event_idempotency_key_unique")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  ],
);

// The parent record staff manage (name, trigger, on/off). The actual graph
// content lives in automationFlowVersion below it — a flow is never edited
// in place, editing publishes a new version instead.
export const automationFlow = pgTable("automation_flow", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** The clinic these rules govern — see drizzle/0058_automation_per_clinic.sql. */
  clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  triggerEventType: text("trigger_event_type").notNull(), // DomainEventType
  status: text("status").notNull().default("draft"), // draft | active | inactive | archived
  // When it was last switched on. Events older than this are not its
  // business — see drizzle/0053_flow_activated_at.sql.
  activatedAt: timestamp("activated_at"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// One immutable snapshot of a flow's graph. At most one version per flow has
// isActive = true (enforced by the partial unique index below) — that's the
// version new runs start on. A run keeps its flowVersionId for its whole
// lifetime, so publishing v2 never changes behavior for runs already on v1.
export const automationFlowVersion = pgTable(
  "automation_flow_version",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    flowId: text("flow_id")
      .notNull()
      .references(() => automationFlow.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    // React Flow's own serialization shape: nodes/edges arrays.
    nodes: jsonb("nodes").notNull().default([]),
    edges: jsonb("edges").notNull().default([]),
    isActive: boolean("is_active").notNull().default(false),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    unique().on(table.flowId, table.versionNumber),
    uniqueIndex("automation_flow_version_one_active_per_flow")
      .on(table.flowId)
      .where(sql`${table.isActive} = true`),
  ],
);

// One execution instance of a flow, pinned to the version it started on.
export const automationFlowRun = pgTable("automation_flow_run", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  flowId: text("flow_id")
    .notNull()
    .references(() => automationFlow.id, { onDelete: "cascade" }),
  flowVersionId: text("flow_version_id")
    .notNull()
    .references(() => automationFlowVersion.id),
  lifecycleEventId: text("lifecycle_event_id").references(() => lifecycleEvent.id),
  contactId: text("contact_id").references(() => contact.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("running"), // running | waiting | completed | failed
  currentNodeId: text("current_node_id"),
  context: jsonb("context").notNull().default({}),
  // Set while suspended on a Delay node — the BullMQ delayed job is the
  // primary resume mechanism, this column backs the reconciliation sweep.
  resumeAt: timestamp("resume_at"),
  // Set while suspended on a "Wait for Reply" node — this is what the
  // inbound WhatsApp webhook checks to find the run to resume when the
  // contact actually replies, instead of a time-based resume.
  waitingForReply: boolean("waiting_for_reply").notNull().default(false),
  // Set while suspended on a "Wait for Event" node — e.g. waiting up to 7
  // days for APPOINTMENT_CREATED before falling into a "not re-engaged"
  // branch. Same idea as waitingForReply, but keyed on a domain event type
  // instead of a WhatsApp message.
  waitingForEventType: text("waiting_for_event_type"),
  startedAt: timestamp("started_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  completedAt: timestamp("completed_at"),
});

// Per-node execution log within a run — observability, and what a Loop node
// iterates against.
export const automationNodeExecution = pgTable("automation_node_execution", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  runId: text("run_id")
    .notNull()
    .references(() => automationFlowRun.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  type: text("type").notNull(),
  input: jsonb("input").notNull().default({}),
  output: jsonb("output"),
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  startedAt: timestamp("started_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  completedAt: timestamp("completed_at"),
});

// Per-(event, flow) processing state. lifecycleEvent itself is never mutated —
// one event can fan out to several flows, so each flow's pickup of that
// event is tracked independently here instead of a single flag on the event.
export const automationTriggerExecution = pgTable(
  "automation_trigger_execution",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    lifecycleEventId: text("lifecycle_event_id")
      .notNull()
      .references(() => lifecycleEvent.id, { onDelete: "cascade" }),
    flowId: text("flow_id")
      .notNull()
      .references(() => automationFlow.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => automationFlowRun.id),
    status: text("status").notNull().default("pending"), // pending | running | completed | failed
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [unique().on(table.lifecycleEventId, table.flowId)],
);

// A flow (or a manual staff send) refers to a template by its `key`, never
// by raw provider template name directly — this is what keeps a flow graph
// stable even if the underlying Meta-approved template name changes.
// Uploaded image/video/PDF assets — the "Stock" library. Templates pick a
// header media URL from here rather than staff pasting raw file
// links by hand.
export const mediaAsset = pgTable("media_asset", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  url: text("url").notNull(),
  publicId: text("public_id").notNull(), // storage key (S3; a Cloudinary public id for older assets)
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  assetType: text("asset_type").notNull(), // image | video | document
  sizeBytes: integer("size_bytes"),
  uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const communicationTemplate = pgTable("communication_template", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  channel: text("channel").notNull(), // whatsapp | email | sms | push | voice
  // marketing | appointmentReminders | medicalReminders | transactional —
  // this is what the consent gate in sendCommunication() checks against.
  // Distinct from wabaCategory below (that one governs Meta approval/pricing).
  category: text("category").notNull(),
  providerTemplateName: text("provider_template_name"), // the actual name submitted to WABA (lowercase_underscore)
  variablesSchema: jsonb("variables_schema").notNull().default([]),
  ctaButtons: jsonb("cta_buttons"), // WhatsApp template buttons: [{type, text, url?, phoneNumber?, example?}]
  // WhatsApp template header media, picked from the Stock library.
  headerMediaUrl: text("header_media_url"),
  headerMediaType: text("header_media_type"), // image | video | document

  // --- WhatsApp Business API (WABA) template submission fields ---
  wabaCategory: text("waba_category"), // MARKETING | UTILITY | AUTHENTICATION
  language: text("language").default("en_US"),
  headerType: text("header_type").default("NONE"), // NONE | TEXT | IMAGE | VIDEO | DOCUMENT
  headerText: text("header_text"),
  bodyText: text("body_text"), // the WhatsApp body content, with {{1}} {{2}} placeholders
  bodyExamples: jsonb("body_examples").notNull().default([]), // sample values, one per placeholder
  footerText: text("footer_text"),
  // draft (never submitted) | pending | approved | rejected
  submissionStatus: text("submission_status").notNull().default("draft"),
  wabaTemplateId: text("waba_template_id"), // Meta's template id once submitted
  rejectionReason: text("rejection_reason"),
  // Meta's ongoing quality signal for an approved template (GREEN | YELLOW |
  // RED | UNKNOWN) — refreshed by `pnpm sync:templates`, not set on submit.
  qualityRating: text("quality_rating"),

  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// One thread per (contact, channel) — outbound and inbound messages both
// append to it, giving staff an actual conversation timeline.
export const communicationConversation = pgTable(
  "communication_conversation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    status: text("status").notNull().default("open"), // open | closed
    lastMessageAt: timestamp("last_message_at"),
    // When staff last opened this thread in the inbox. Inbound messages after
    // it are unread — the Inbox badge counts those conversations.
    lastReadAt: timestamp("last_read_at"),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [unique().on(table.contactId, table.channel)],
);

// Unified outbound *and* inbound log across every channel.
export const communicationMessage = pgTable(
  "communication_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => communicationConversation.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // outbound | inbound
    channel: text("channel").notNull(),
    templateId: text("template_id").references(() => communicationTemplate.id),
    variables: jsonb("variables").notNull().default({}),
    body: text("body"), // inbound free text, or the resolved outbound text
    // queued | sent | delivered | read | failed | skipped_no_consent
    status: text("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    // Which number it went out on (or arrived on), once there is more than one.
    clinicChannelId: text("clinic_channel_id").references(() => clinicChannel.id, { onDelete: "set null" }),
    // Written by the AI fallback replier, not a template or a person.
    aiGenerated: boolean("ai_generated").notNull().default(false),
    // Set when a staff member sent this manually rather than a flow.
    sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
    // Set when an automation flow run produced this message, so the run's
    // timeline can show exactly what it sent. Null for manual sends and for
    // inbound messages.
    runId: text("run_id"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("communication_message_idempotency_key_unique")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    // Every inbox question is "this thread's messages, newest first, maybe
    // only theirs" — without it each one read the whole table. See 0100.
    index("communication_message_conversation_direction_created_idx").on(
      table.conversationId,
      table.direction,
      table.createdAt,
    ),
    index("communication_message_conversation_created_idx").on(table.conversationId, table.createdAt),
    index("communication_message_run_idx").on(table.runId).where(sql`${table.runId} is not null`),
    index("communication_message_contact_direction_created_idx").on(table.contactId, table.direction, table.createdAt),
  ],
);

// Consent gate, checked inside sendCommunication() before any adapter is
// called. Marketing/promotional and transactional/medical messaging carry
// different consent weight, so they're tracked separately rather than one
// blanket opt-in/out.
export const contactCommunicationPreference = pgTable("contact_communication_preference", {
  contactId: text("contact_id")
    .primaryKey()
    .references(() => contact.id, { onDelete: "cascade" }),
  marketing: boolean("marketing").notNull().default(true),
  appointmentReminders: boolean("appointment_reminders").notNull().default(true),
  medicalReminders: boolean("medical_reminders").notNull().default(true),
  transactional: boolean("transactional").notNull().default(true),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(true),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  smsEnabled: boolean("sms_enabled").notNull().default(true),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// A named, staff-curated list of contacts — used to target a manual send or
// (later) as a flow trigger scope. Membership is explicit (added one at a
// time or in bulk from the audience-builder UI), not a saved filter.
export const audience = pgTable("audience", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
  clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const audienceMember = pgTable(
  "audience_member",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    audienceId: text("audience_id")
      .notNull()
      .references(() => audience.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [unique().on(table.audienceId, table.contactId)],
);

// The roles a clinic actually staffs.
//
// Roles used to be an enum in code, which meant a clinic could not name a role
// the code had not anticipated — "therapist", "lab technician" — without a
// deploy. The permissions were already data; this makes the role itself data
// too, so the two halves finally match.
//
// key is immutable and label is not. Both user.role and role_permission.role
// store the key, so rekeying would strand every account and every grant; the
// label exists so that renaming a role never has to touch either.
//
// panel decides where a login lands. That used to be an if-else that fell
// through to the patient app for any role it did not recognise, which is
// precisely what a newly created role would have hit.
export const role = pgTable("role", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description"),
  /** clinic | operations | patient — see RolePanel in ./roles.ts. */
  panel: text("panel").notNull(),
  /** Named by the code itself: re-grantable, never deletable or rekeyable. */
  isSystem: boolean("is_system").default(false).notNull(),
  sortOrder: integer("sort_order").default(100).notNull(),
  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Which role may reach which page. Grant-only: a row means "yes", its absence
// means "no", so there is no third state for anyone to misread.
//
// role and permission are both plain text rather than foreign keys — role
// because user.role already is, and permission because the authoritative list
// lives in code (see ./permissions.ts). A row naming a permission that no
// longer exists is simply ignored, which is what should happen when a page is
// removed: nobody is locked out of anything, the grant just stops mattering.
//
// Superadmin is deliberately absent from this table and always will be. It
// bypasses the check entirely, because the one thing this feature must never
// do is let a mis-click remove the ability to undo the mis-click.
export const rolePermission = pgTable(
  "role_permission",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    role: text("role").notNull(),
    permission: text("permission").notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("role_permission_role_permission_unique").on(table.role, table.permission),
    index("role_permission_role_idx").on(table.role),
  ],
);

// One person's departures from what their role gives them.
//
// The role is a starting point, not a rule: two doctors at the same clinic do
// not necessarily do the same job, and a new doctor should not have to be
// configured from zero. So the role supplies a baseline and this table records
// only the differences.
//
// `granted` is a real boolean here, unlike role_permission where absence means
// no. There the states were yes/no; here they are grant, revoke, and inherit —
// and inherit is the one that matters most, because a row that merely repeats
// the role's answer would silently stop tracking it the moment the role
// changed. No row means "whatever the role says, now and later".
export const userPermission = pgTable(
  "user_permission",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    /** true = granted on top of the role, false = revoked from it. */
    granted: boolean("granted").notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_permission_user_permission_unique").on(table.userId, table.permission),
    index("user_permission_user_idx").on(table.userId),
  ],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
});
// A one-off broadcast: a template, a list of numbers, and what happened to
// each. See migration 0017 for why recipients are their own table rather than
// a column on communication_message — a number that is malformed, duplicated
// or refused by consent never produces a message, and those are exactly the
// rows a report has to account for.
export const campaign = pgTable("campaign", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
  clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  templateId: text("template_id")
    .notNull()
    .references(() => communicationTemplate.id, { onDelete: "restrict" }),
  /** draft | scheduled | sending | paused | completed */
  status: text("status").notNull().default("draft"),
  /** Variable bindings, in the shape the broadcast dialog already uses. */
  variables: jsonb("variables").notNull().default({}),
  /** Set: the worker sends it from the server at this time (see campaign-send.ts). */
  scheduledAt: timestamp("scheduled_at"),
  /** When the one automatic retry of failures ran (see campaign-send.ts). */
  retriedAt: timestamp("retried_at"),
  createdByUserId: text("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const campaignRecipient = pgTable(
  "campaign_recipient",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    name: text("name"),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "set null" }),
    /**
     * pending | sent | failed | skipped.
     *
     * Anything past "sent" — delivered, read — lives on the message row, which
     * is what the status webhook updates. Copying it here would give two
     * answers to one question.
     */
    status: text("status").notNull().default("pending"),
    messageId: text("message_id").references(() => communicationMessage.id, {
      onDelete: "set null",
    }),
    error: text("error"),
    /** 1 for the first send, 2 once the automatic retry has picked it up. */
    attempts: integer("attempts").notNull().default(1),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("campaign_recipient_campaign_phone_unique").on(table.campaignId, table.phone),
    index("campaign_recipient_campaign_status_idx").on(table.campaignId, table.status),
  ],
);

// A lead form submission from Meta, Google or the website — see
// drizzle/0047_lead_submission.sql. One contact, many submissions.
export const leadSubmission = pgTable(
  "lead_submission",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "cascade" }),
    // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
    clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
    provider: text("provider").notNull(), // meta | google | website
    externalId: text("external_id").notNull(),
    formId: text("form_id"),
    formName: text("form_name"),
    campaignId: text("campaign_id"),
    campaignName: text("campaign_name"),
    adsetId: text("adset_id"),
    adsetName: text("adset_name"),
    adId: text("ad_id"),
    adName: text("ad_name"),
    platform: text("platform"),
    pageId: text("page_id"),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    raw: jsonb("raw"),
    isTest: boolean("is_test").notNull().default(false),
    isOrganic: boolean("is_organic").notNull().default(false),
    fetchError: text("fetch_error"),
    submittedAt: timestamp("submitted_at"),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lead_submission_provider_external_unique").on(table.provider, table.externalId),
    index("lead_submission_contact_idx").on(table.contactId, table.receivedAt),
  ],
);

// Lead routing rules — see drizzle/0048_lead_routing.sql.
export const leadRule = pgTable("lead_rule", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  kind: text("kind").notNull(), // assign | interest
  // Which clinic this belongs to. See drizzle/0056_multi_clinic.sql.
  clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(100),
  active: boolean("active").notNull().default(true),
  matchField: text("match_field").notNull().default("any"),
  matchValues: text("match_values").notNull().default(""),
  assignRole: text("assign_role"),
  assignUserIds: jsonb("assign_user_ids").$type<string[]>().notNull().default([]),
  interest: text("interest"),
  // Where this rule's clinic is — see drizzle/0049_lead_rule_hub.sql.
  hubLabel: text("hub_label"),
  hubLat: doublePrecision("hub_lat"),
  hubLng: doublePrecision("hub_lng"),
  rrCursor: integer("rr_cursor").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Settings for the AI that answers replies nothing else handles — see
// drizzle/0051_ai_replies.sql. Exactly one row, updated in place.
export const aiReplyConfig = pgTable("ai_reply_config", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** The clinic these rules govern — see drizzle/0058_automation_per_clinic.sql. */
  clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  provider: text("provider").notNull().default("openai"),
  model: text("model").notNull().default("gpt-4o-mini"),
  temperature: doublePrecision("temperature").notNull().default(0.3),
  maxOutputTokens: integer("max_output_tokens").notNull().default(800),
  businessInfo: text("business_info").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  dailyLimitPerContact: integer("daily_limit_per_contact").notNull().default(6),
  humanTakeoverMinutes: integer("human_takeover_minutes").notNull().default(30),
  handoffKeywords: text("handoff_keywords").notNull().default(""),
  handoffCreatesTask: boolean("handoff_creates_task").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// House rules for automation — see drizzle/0054_automation_settings.sql.
export const automationSettings = pgTable("automation_settings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** The clinic these rules govern — see drizzle/0058_automation_per_clinic.sql. */
  clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "cascade" }),
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(true),
  quietStartHour: integer("quiet_start_hour").notNull().default(21),
  quietEndHour: integer("quiet_end_hour").notNull().default(9),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  firstResponseMinutes: integer("first_response_minutes").notNull().default(30),
  callbackReminders: boolean("callback_reminders").notNull().default(true),
  // Both unused since the call queue replaced email alerts: a lead waiting
  // for a call is shown on the queue, not sent to an inbox nobody watches
  // mid-shift. Kept rather than dropped so the settings saved in them are
  // not lost if email alerts are ever wanted back.
  notifyAssignee: boolean("notify_assignee").notNull().default(true),
  managerEmail: text("manager_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Stage messages: one fixed WhatsApp template per lead/appointment moment
 * ("call not connected", "appointment missed" …), switched on and chosen on
 * the Stage Messages page. The moments themselves are a fixed catalogue in
 * ./stage-messages.ts; a row here exists once somebody has configured one.
 *
 * Multi-step sequences (nurture, re-engagement) stay flows — this is for the
 * single message a moment always deserves.
 */
export const stageMessageRule = pgTable("stage_message_rule", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** A key from STAGE_MESSAGE_TRIGGERS, e.g. "call_not_connected". */
  triggerKey: text("trigger_key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  /** communication_template.key — chosen from the approved WhatsApp templates. */
  templateKey: text("template_key"),
  delayMinutes: integer("delay_minutes").notNull().default(0),
  respectQuietHours: boolean("respect_quiet_hours").notNull().default(true),
  /** Events before this are never sent — switching a rule on must not message the backlog. */
  enabledAt: timestamp("enabled_at"),
  lastSentAt: timestamp("last_sent_at"),
  sentCount: integer("sent_count").notNull().default(0),
  updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * A doctor or nutritionist whose booking message is not the generic one.
 *
 * The moment still has one switch and one default template. A row here means
 * "when the visit is with this person, send this template instead" — that
 * template carries its own approved image or video. Anyone not listed gets
 * the default.
 */
export const stageMessageDoctorTemplate = pgTable(
  "stage_message_doctor_template",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    triggerKey: text("trigger_key").notNull(),
    doctorUserId: text("doctor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    templateKey: text("template_key").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique().on(table.triggerKey, table.doctorUserId)],
);

/**
 * One row per (event, rule): the claim that stops a message going twice when
 * the worker's poll sees the same event again, and the record of what became
 * of it.
 */
export const stageMessageSend = pgTable(
  "stage_message_send",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    lifecycleEventId: text("lifecycle_event_id")
      .notNull()
      .references(() => lifecycleEvent.id, { onDelete: "cascade" }),
    ruleId: text("rule_id")
      .notNull()
      .references(() => stageMessageRule.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "cascade" }),
    templateKey: text("template_key"),
    // queued | sent | skipped | failed
    status: text("status").notNull().default("queued"),
    detail: text("detail"),
    sendAt: timestamp("send_at"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.lifecycleEventId, table.ruleId),
    index("stage_message_send_rule_created_idx").on(table.ruleId, table.createdAt),
  ],
);

/** The one switch over all stage messages. A single row, id "global". */
export const stageMessageSetting = pgTable("stage_message_setting", {
  id: text("id").primaryKey(),
  paused: boolean("paused").notNull().default(false),
  updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Who is still running. Stamped every tick by the worker and the webhook.
export const systemHeartbeat = pgTable("system_heartbeat", {
  name: text("name").primaryKey(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  detail: text("detail"),
});

// A clinic — the tenant everything else belongs to.
// See drizzle/0056_multi_clinic.sql.
export const clinic = pgTable("clinic", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  /** Short handle used in lists and routing rules ("delhi"). */
  slug: text("slug").notNull().unique(),
  city: text("city"),
  state: text("state"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  pincode: text("pincode"),
  phone: text("phone"),
  email: text("email"),
  gstin: text("gstin"),
  registrationNo: text("registration_no"),
  /** Printed on this clinic's own bills and forms. */
  footerNote: text("footer_note"),
  consentText: text("consent_text"),
  /** Where it is, for nearest-clinic lead routing. */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  /**
   * clinic — one of ours. partner — a partner hospital (Apollo): its doctors
   * see only the patients it registered, and it takes no leads.
   * See drizzle/0079_partner_clinics.sql.
   */
  kind: text("kind").notNull().default("clinic"),
  /**
   * Its brand on the panel, receipts and forms. See drizzle/0095_clinic_branding.sql.
   * shortName is what fits in a tab title ("OPTM"); the logos are public URLs.
   */
  shortName: text("short_name"),
  legalName: text("legal_name"),
  website: text("website"),
  logoUrl: text("logo_url"),
  logoDarkUrl: text("logo_dark_url"),
  iconUrl: text("icon_url"),
  /** #rrggbb, or null for the panel default. */
  brandColor: text("brand_color"),
  /** OPTM/26-27/00080 — each clinic numbers its own receipts. */
  receiptPrefix: text("receipt_prefix").notNull().default("RCPT"),
  /** What it uses of the panel — see clinic-modules.ts. */
  modules: text("modules").array().notNull().default(["appointments", "therapy", "medicine", "billing", "diagnosis"]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * The Google account that hosts this clinician's Meet links.
 *
 * One row per doctor or nutritionist, written once from Availability. The
 * front desk never connects anything: a virtual visit uses the person who
 * will take the meeting. Kept off the user row so a staff list cannot leak
 * the refresh token.
 */
export const practitionerGoogleCalendar = pgTable("practitioner_google_calendar", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  refreshToken: text("refresh_token").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Who works where, and as what.
 *
 * The role lives here rather than on the user, so the same person can be a
 * telecaller in one clinic and a manager in another without a second login.
 * user.role remains the fallback for accounts with no membership, and the
 * one place "superadmin" — who stands outside every clinic — is recorded.
 */
export const clinicMember = pgTable(
  "clinic_member",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("clinic_member_unique").on(table.clinicId, table.userId),
    index("clinic_member_user_idx").on(table.userId),
  ],
);

// Which WhatsApp number belongs to which clinic — see
// drizzle/0059_clinic_channel.sql. Tokens stay in the environment; this row
// only names the variable that holds one.
export const clinicChannel = pgTable(
  "clinic_channel",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("whatsapp"),
    /** Meta's id for the sending number — the inbound webhook carries it. */
    phoneNumberId: text("phone_number_id").notNull(),
    wabaId: text("waba_id"),
    displayNumber: text("display_number"),
    /** Env var holding this number's token. Empty = WHATSAPP_ACCESS_TOKEN. */
    tokenEnvVar: text("token_env_var"),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("clinic_channel_number_unique").on(table.phoneNumberId)],
);

/**
 * A template is approved per WABA.
 *
 * With one WhatsApp number this is one row per template. With two, the same
 * template can be live on one number and still pending on the other — and a
 * send has to know which, rather than finding out from a Graph error.
 */
export const templateChannel = pgTable(
  "template_channel",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    templateId: text("template_id")
      .notNull()
      .references(() => communicationTemplate.id, { onDelete: "cascade" }),
    clinicChannelId: text("clinic_channel_id")
      .notNull()
      .references(() => clinicChannel.id, { onDelete: "cascade" }),
    providerTemplateName: text("provider_template_name"),
    wabaTemplateId: text("waba_template_id"),
    submissionStatus: text("submission_status").notNull().default("draft"),
    rejectionReason: text("rejection_reason"),
    qualityRating: text("quality_rating"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("template_channel_unique").on(table.templateId, table.clinicChannelId)],
);

// ─── Expenses ────────────────────────────────────────────────────────────
//
// Money out, beside the payment table's money in. One row per thing paid for;
// a mistake is voided with a reason, never deleted, exactly as a payment is —
// so the month's books can always be read back the way they were entered.
export const expenseRecurring = pgTable(
  "expense_recurring",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    /** See EXPENSE_CATEGORIES in ./expense. */
    category: text("category").notNull(),
    amountInPaise: integer("amount_in_paise").notNull(),
    method: text("method").notNull().default("bank"),
    paidTo: text("paid_to"),
    note: text("note"),
    /** 1–28, so every month has the day. */
    dayOfMonth: integer("day_of_month").notNull().default(1),
    /** First month it is entered for (YYYY-MM-DD, the 1st). */
    startsOn: date("starts_on").notNull(),
    active: boolean("active").notNull().default(true),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("expense_recurring_clinic_idx").on(table.clinicId)],
);

export const expense = pgTable(
  "expense",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    /** The day it was paid, India time. */
    spentOn: date("spent_on").notNull(),
    category: text("category").notNull(),
    amountInPaise: integer("amount_in_paise").notNull(),
    /** cash | card | upi | bank | other — the same list as payments. */
    method: text("method").notNull(),
    paidTo: text("paid_to"),
    /** UPI ref, cheque or invoice number. */
    reference: text("reference"),
    note: text("note"),
    /** A photo or PDF of the bill, in private storage. */
    billUrl: text("bill_url"),
    billName: text("bill_name"),
    /** Entered by a monthly repeat, and for which month — one per month. */
    recurringId: text("recurring_id").references(() => expenseRecurring.id, { onDelete: "set null" }),
    recurringMonth: text("recurring_month"),
    voidedAt: timestamp("voided_at"),
    voidReason: text("void_reason"),
    voidedByUserId: text("voided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("expense_clinic_day_idx").on(table.clinicId, table.spentOn),
    uniqueIndex("expense_recurring_month_unique").on(table.recurringId, table.recurringMonth),
  ],
);

/**
 * Cash moved from the drawer to the clinic's bank account. Not an expense —
 * the money is still the clinic's — so it lowers the drawer and never the
 * profit. Taken to the bank (via "bank"), or handed to someone who needed cash
 * and sent the same amount to the clinic's account (via "person").
 */
export const cashDeposit = pgTable(
  "cash_deposit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    /** The day the cash left the drawer, India time. */
    depositedOn: date("deposited_on").notNull(),
    amountInPaise: integer("amount_in_paise").notNull(),
    /** bank | person — see CASH_DEPOSIT_VIA. */
    via: text("via").notNull(),
    /** Who took the cash and transferred it, when via is "person". */
    personName: text("person_name"),
    /** Deposit slip number, or the transfer's UTR. */
    reference: text("reference"),
    note: text("note"),
    voidedAt: timestamp("voided_at"),
    voidReason: text("void_reason"),
    voidedByUserId: text("voided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("cash_deposit_clinic_day_idx").on(table.clinicId, table.depositedOn)],
);


// ─── Medicine bills ──────────────────────────────────────────────────────
//
// What was handed over and what it came to, apart from whether it was paid.
// A sale used to be its payment, so medicine taken now and paid for later had
// nowhere to be written down. Payments point here (payment.medicine_sale_id);
// what is owed is the bill less its live payments.
export const medicineSale = pgTable(
  "medicine_sale",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    clinicId: text("clinic_id").references(() => clinic.id, { onDelete: "set null" }),
    /** The visit it was bought at; null over the counter. */
    appointmentId: text("appointment_id").references(() => appointment.id, { onDelete: "set null" }),
    /** Before discounts. */
    grossInPaise: integer("gross_in_paise").notNull(),
    discountInPaise: integer("discount_in_paise").notNull().default(0),
    /** What is charged: gross − discount. */
    totalInPaise: integer("total_in_paise").notNull(),
    note: text("note"),
    soldByUserId: text("sold_by_user_id").references(() => user.id, { onDelete: "set null" }),
    soldAt: timestamp("sold_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
    voidedAt: timestamp("voided_at"),
    voidReason: text("void_reason"),
  },
  (table) => [
    index("medicine_sale_contact_idx").on(table.contactId, table.soldAt),
    index("medicine_sale_clinic_idx").on(table.clinicId, table.soldAt),
  ],
);

export const medicineSaleLine = pgTable(
  "medicine_sale_line",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    saleId: text("sale_id")
      .notNull()
      .references(() => medicineSale.id, { onDelete: "cascade" }),
    medicineId: text("medicine_id").references(() => medicine.id, { onDelete: "set null" }),
    /** As it was called when sold. */
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    rateInPaise: integer("rate_in_paise").notNull(),
    /** percent | amount, or null for none. */
    discountType: text("discount_type"),
    /** A percentage (0–100) or rupees off this line, as typed. */
    discountValue: doublePrecision("discount_value"),
    discountInPaise: integer("discount_in_paise").notNull().default(0),
    /** rate × qty − discount. */
    amountInPaise: integer("amount_in_paise").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("medicine_sale_line_sale_idx").on(table.saleId)],
);

// The clinic's therapists. Therapy hours are booked against one of them, and
// an hour holds as many patients as there are therapists working.
export const therapist = pgTable(
  "therapist",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** male | female — patients often ask for one or the other. */
    gender: text("gender"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at")
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("therapist_clinic_idx").on(table.clinicId)],
);

/**
 * A clinic's patient referred to Predict for diagnosis. The patient stays the
 * clinic's; this is what makes them Predict's too, and when their predict.fit
 * login is made. See drizzle/0097_predict_referral.sql and predict-referral.ts.
 */
export const predictReferral = pgTable(
  "predict_referral",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    patientId: text("patient_id")
      .notNull()
      .references(() => patientRecord.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contact.id, { onDelete: "set null" }),
    /** The clinic that referred them. */
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    /** What for — see REFERRAL_SERVICES. */
    services: text("services").array().notNull(),
    /** referred | in_progress | completed | cancelled */
    status: text("status").notNull().default("referred"),
    note: text("note"),
    /** The patient's consent to share their details with Predict, taken by this staff member. */
    consentAt: timestamp("consent_at").notNull(),
    consentByUserId: text("consent_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("predict_referral_patient_idx").on(table.patientId),
    index("predict_referral_clinic_idx").on(table.clinicId, table.status),
  ],
);
