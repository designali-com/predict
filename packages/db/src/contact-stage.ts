// contact.stage is the lifecycle position and nothing else. It used to be a
// column called `status` that also carried nurture outcomes like
// LONG_TERM — but a person can be a long-term *lead*, so writing LONG_TERM
// erased the fact that they were still a LEAD and every
// `stage == "LEAD"` condition in a flow stopped matching them. Engagement
// now lives in its own column.

export const ContactStage = {
  /**
   * A number we have messaged who never asked us for anything — a campaign
   * recipient, a one-off send, a chat from the phone's history.
   *
   * Not a lead. Sending a broadcast used to create every unknown number as
   * a LEAD, so each campaign inflated the lead list and the funnel with
   * people who had never enquired, and sending again next week "created"
   * them again in the numbers. They become a LEAD only by enquiring: filling
   * a form, messaging us, or staff deciding so — see promoteToLead().
   */
  AUDIENCE: "AUDIENCE",
  /** Known to us, not converted yet. */
  LEAD: "LEAD",
  /**
   * Has an appointment on the books, has not been seen yet.
   *
   * Split out of PATIENT because booking and attending are not the same
   * event and no-shows are a real cohort, not an edge case. While the two
   * were one value, someone who booked and never turned up was permanently
   * marked PATIENT — which also meant every nurture flow's
   * `stage == "LEAD"` check stopped matching them, so the warmest lead in
   * the system silently fell out of every automation forever.
   */
  BOOKED: "BOOKED",
  /**
   * Converted — on a treatment plan, and now on the clinical side.
   *
   * Attending a consultation is deliberately NOT enough. Someone can come in
   * once, be assessed and never return; marking them PATIENT then took them
   * off the follow-up list that would have sold them a course. Buying a
   * sitting plan is the commitment — see enrollInPlan.
   */
  PATIENT: "PATIENT",
  /** Was a patient, has gone quiet. */
  INACTIVE: "INACTIVE",
  /** Disqualified or explicitly not interested. */
  LOST: "LOST",
} as const;

export type ContactStage = (typeof ContactStage)[keyof typeof ContactStage];

export const CONTACT_STAGES = Object.values(ContactStage);

// Where a contact sits in nurture, independent of stage. Null means "no
// nurture outcome recorded yet".
export const ContactEngagement = {
  /** Nurture sequence ran its course without converting; keep in touch slowly. */
  LONG_TERM: "LONG_TERM",
  /** Actively being worked right now. */
  ACTIVE: "ACTIVE",
  /** Asked not to be contacted. Consent flags still gate sending. */
  DO_NOT_CONTACT: "DO_NOT_CONTACT",
} as const;

export type ContactEngagement = (typeof ContactEngagement)[keyof typeof ContactEngagement];

export const CONTACT_ENGAGEMENTS = Object.values(ContactEngagement);

export function isContactStage(value: unknown): value is ContactStage {
  return typeof value === "string" && (CONTACT_STAGES as string[]).includes(value);
}
