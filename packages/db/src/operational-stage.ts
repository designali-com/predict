// The funnel the console shows, which is deliberately NOT the same list as
// contact.stage.
//
// contact.stage is the lifecycle: five values, each one a fact about the
// person that only changes on a real event (they booked, they attended, they
// went quiet). Those five are stored.
//
// An operator needs more resolution than that — "is this lead being worked by
// a flow, or waiting on a human, or halfway through booking?" — but none of
// those are facts about the person. They are facts about the *system's
// current relationship* with the person, and they are already implied by data
// we hold: active runs, inbound messages, open tasks, appointment rows.
//
// So they are computed, never written. Storing them would create a second
// source of truth that drifts: `stage = ATTENDED` alongside
// `appointment.status = cancelled` is a contradiction the database would
// happily hold, and someone would then have to decide which one to believe.
// Deriving means the funnel cannot disagree with the underlying rows.
//
// This is also what stops the stage list growing to twenty. Every new
// operational question ("who is mid-booking?", "who replied but went quiet?")
// is answered by adding a derivation here, not a value to contact.stage.

export const OperationalPhase = {
  ACQUISITION: "ACQUISITION",
  ENGAGEMENT: "ENGAGEMENT",
  APPOINTMENT: "APPOINTMENT",
  PATIENT: "PATIENT",
} as const;

export type OperationalPhase = (typeof OperationalPhase)[keyof typeof OperationalPhase];

export const OperationalStage = {
  NEW_LEAD: "NEW_LEAD",
  NURTURING: "NURTURING",
  ENGAGED: "ENGAGED",
  HUMAN_FOLLOW_UP: "HUMAN_FOLLOW_UP",
  APPOINTMENT_PENDING: "APPOINTMENT_PENDING",
  BOOKED: "BOOKED",
  ATTENDED: "ATTENDED",
  PATIENT: "PATIENT",
} as const;

export type OperationalStage = (typeof OperationalStage)[keyof typeof OperationalStage];

export interface OperationalStageMeta {
  stage: OperationalStage;
  phase: OperationalPhase;
  label: string;
  /** What a person in this bucket is actually doing, in one line. */
  caption: string;
  /** Which rows put them here — the answer to "why is this number 11?". */
  derivedFrom: string;
}

/**
 * Ordered least- to most-advanced. A contact lands in exactly one bucket: the
 * evaluation walks this list from the END and takes the first match, so
 * someone who is mid-booking AND has an open task counts once, as the further
 * along of the two. Without that rule the columns overlap and the funnel stops
 * summing to the number of people you actually have.
 */
export const OPERATIONAL_STAGES: OperationalStageMeta[] = [
  {
    stage: "NEW_LEAD",
    phase: "ACQUISITION",
    label: "New Lead",
    caption: "Just arrived, nothing has happened yet",
    derivedFrom: "stage LEAD, no run, no reply, no task",
  },
  {
    stage: "NURTURING",
    phase: "ACQUISITION",
    label: "Nurturing",
    caption: "An automation is working them",
    derivedFrom: "stage LEAD + a running or waiting flow run",
  },
  {
    stage: "ENGAGED",
    phase: "ENGAGEMENT",
    label: "Engaged",
    caption: "They answered us at least once",
    derivedFrom: "stage LEAD + an inbound message",
  },
  {
    stage: "HUMAN_FOLLOW_UP",
    phase: "ENGAGEMENT",
    label: "Human follow-up",
    caption: "Needs a person — automation handed it over",
    derivedFrom: "stage LEAD + an open task, or an unanswered inbound message",
  },
  {
    stage: "APPOINTMENT_PENDING",
    phase: "APPOINTMENT",
    label: "Appointment pending",
    caption: "Trying to book, not booked yet",
    derivedFrom: "stage LEAD + asked to book (event or live booking run), no appointment",
  },
  {
    stage: "BOOKED",
    phase: "APPOINTMENT",
    label: "Booked",
    caption: "Appointment on the books, not seen yet",
    derivedFrom: "stage BOOKED",
  },
  {
    stage: "ATTENDED",
    phase: "APPOINTMENT",
    label: "Attended",
    caption: "Came in, not yet on the clinical side",
    derivedFrom: "stage BOOKED + a completed appointment",
  },
  {
    stage: "PATIENT",
    phase: "PATIENT",
    label: "Patient",
    caption: "Converted — under care",
    derivedFrom: "stage PATIENT",
  },
];

export const OPERATIONAL_PHASES: { phase: OperationalPhase; label: string }[] = [
  { phase: "ACQUISITION", label: "Acquisition" },
  { phase: "ENGAGEMENT", label: "Engagement" },
  { phase: "APPOINTMENT", label: "Appointment" },
  { phase: "PATIENT", label: "Patient" },
];

/**
 * Deliberately outside the funnel. These are exits and flags, not steps —
 * counting them as funnel stages would make the funnel stop describing a
 * journey and start describing a filing cabinet.
 */
export const SIDE_FILTERS = [
  { key: "INACTIVE", label: "Inactive", derivedFrom: "stage INACTIVE" },
  { key: "LOST", label: "Lost", derivedFrom: "stage LOST" },
  { key: "NO_SHOW", label: "No-show", derivedFrom: "an appointment marked no_show" },
  { key: "CANCELLED", label: "Cancelled", derivedFrom: "an appointment marked cancelled" },
  { key: "DO_NOT_CONTACT", label: "Do not contact", derivedFrom: "engagement DO_NOT_CONTACT" },
] as const;

export type SideFilterKey = (typeof SIDE_FILTERS)[number]["key"];
