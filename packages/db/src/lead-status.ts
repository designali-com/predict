// Where a lead is in being *worked* by a person — the call disposition a
// telecaller sets after each attempt.
//
// Not contact.stage. Stage is the lifecycle (LEAD -> BOOKED -> PATIENT) and
// only moves on real events; "No answer" or "Call back later" say nothing
// about that — the person is still a LEAD either way. Mixing the two is what
// contact-stage.ts already warns about. It is also not the derived
// operational stage: nothing in the database implies "they did not pick up"
// except somebody saying so.
//
// Every status also has its own domain event (LEAD_STATUS_<KEY>), so "when a
// lead is marked No answer, WhatsApp them" is a flow with that trigger —
// no condition chain on a generic status-changed event.

export const LeadStatus = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  NO_ANSWER: "NO_ANSWER",
  NOT_REACHABLE: "NOT_REACHABLE",
  CALLBACK_LATER: "CALLBACK_LATER",
  INFO_SENT: "INFO_SENT",
  INTERESTED: "INTERESTED",
  BUDGET_ISSUE: "BUDGET_ISSUE",
  APPOINTMENT_BOOKED: "APPOINTMENT_BOOKED",
  APPOINTMENT_CONFIRMED: "APPOINTMENT_CONFIRMED",
  APPOINTMENT_MISSED: "APPOINTMENT_MISSED",
  APPOINTMENT_CANCELLED: "APPOINTMENT_CANCELLED",
  VISITED: "VISITED",
  NOT_INTERESTED: "NOT_INTERESTED",
  OUT_OF_AREA: "OUT_OF_AREA",
  INVALID_NUMBER: "INVALID_NUMBER",
  DUPLICATE: "DUPLICATE",
  LOST: "LOST",
} as const;

export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export interface LeadStatusMeta {
  key: LeadStatus;
  label: string;
  /** Tailwind classes for the chip. */
  tone: string;
  /** Closed statuses drop out of the default "to work" view. */
  closed?: boolean;
  /**
   * Set by the appointment, never picked by a caller: booking sets Booked, and
   * marking the appointment confirmed / no-show / cancelled / attended sets
   * the rest (appointment-outcome.ts). Shown on the lead, not offered as a
   * call outcome — a caller cannot know someone visited.
   */
  auto?: boolean;
  /** Which side of the first question it answers: did the call connect? */
  call?: "connected" | "not_connected";
  /** A time to ring again: required (a promised callback) or optional (try again at). */
  time?: "required" | "optional";
}

export const LEAD_STATUSES: LeadStatusMeta[] = [
  // What a caller learns on the phone.
  { key: "NEW", label: "New", tone: "bg-blue-100 text-blue-700" },
  { key: "CONTACTED", label: "Spoke — follow up", tone: "bg-sky-100 text-sky-700", call: "connected" },
  { key: "NO_ANSWER", label: "No answer", tone: "bg-amber-100 text-amber-800", call: "not_connected", time: "optional" },
  { key: "NOT_REACHABLE", label: "Switched off / busy", tone: "bg-amber-100 text-amber-800", call: "not_connected", time: "optional" },
  { key: "CALLBACK_LATER", label: "Callback later", tone: "bg-violet-100 text-violet-700", call: "connected", time: "required" },
  { key: "INFO_SENT", label: "Details sent on WhatsApp", tone: "bg-sky-100 text-sky-700", call: "connected" },
  { key: "INTERESTED", label: "Interested", tone: "bg-emerald-100 text-emerald-700", call: "connected" },
  // Wants it, cannot afford it right now: still open — an offer, EMI or a
  // smaller plan can win them back (flow trigger LEAD_STATUS_BUDGET_ISSUE).
  { key: "BUDGET_ISSUE", label: "Budget issue", tone: "bg-orange-100 text-orange-800", call: "connected" },
  // What happened to the appointment — set from it, not chosen.
  { key: "APPOINTMENT_BOOKED", label: "Appointment booked", tone: "bg-indigo-100 text-indigo-700", auto: true },
  { key: "APPOINTMENT_CONFIRMED", label: "Appointment confirmed", tone: "bg-indigo-100 text-indigo-700", auto: true },
  { key: "APPOINTMENT_MISSED", label: "Appointment missed", tone: "bg-orange-100 text-orange-800", auto: true },
  { key: "APPOINTMENT_CANCELLED", label: "Appointment cancelled", tone: "bg-orange-100 text-orange-800", auto: true },
  { key: "VISITED", label: "Visited", tone: "bg-green-100 text-green-700", closed: true, auto: true },
  // Dead ends: these also move the lead to stage Lost.
  { key: "NOT_INTERESTED", label: "Not interested", tone: "bg-muted text-muted-foreground", closed: true, call: "connected" },
  { key: "OUT_OF_AREA", label: "Too far / out of area", tone: "bg-muted text-muted-foreground", closed: true, call: "connected" },
  { key: "INVALID_NUMBER", label: "Wrong / invalid number", tone: "bg-red-100 text-red-700", closed: true, call: "not_connected" },
  { key: "DUPLICATE", label: "Duplicate lead", tone: "bg-muted text-muted-foreground", closed: true, call: "connected" },
  { key: "LOST", label: "Lost", tone: "bg-muted text-muted-foreground", closed: true, call: "connected" },
];

/** The ones a caller picks after a call (the rest come from the appointment). */
export const CALL_OUTCOMES = LEAD_STATUSES.filter((s) => !s.auto);

/** Call outcomes split by the first question a caller answers: did it connect? */
export const CONNECTED_OUTCOMES = LEAD_STATUSES.filter((s) => s.call === "connected");
export const NOT_CONNECTED_OUTCOMES = LEAD_STATUSES.filter((s) => s.call === "not_connected");

/** Statuses that carry a time to ring again — queued and reminded at that time. */
export const TIMED_STATUSES: LeadStatus[] = LEAD_STATUSES.filter((s) => s.time).map((s) => s.key);

/** Outcomes that end the lead: they also move its stage to LOST. */
export const DEAD_END_STATUSES: LeadStatus[] = ["NOT_INTERESTED", "OUT_OF_AREA", "INVALID_NUMBER", "DUPLICATE", "LOST"];

/** An appointment outcome (appointment.status) as the lead status it implies. */
export const APPOINTMENT_LEAD_STATUS: Record<string, LeadStatus> = {
  confirmed: "APPOINTMENT_CONFIRMED",
  no_show: "APPOINTMENT_MISSED",
  cancelled: "APPOINTMENT_CANCELLED",
  completed: "VISITED",
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && LEAD_STATUSES.some((s) => s.key === value);
}

export function leadStatusMeta(key: string | null | undefined): LeadStatusMeta | undefined {
  return LEAD_STATUSES.find((s) => s.key === key);
}

/** The per-status domain event, e.g. NO_ANSWER -> "LEAD_STATUS_NO_ANSWER". */
export function leadStatusEventType(status: LeadStatus) {
  return `LEAD_STATUS_${status}` as const;
}
