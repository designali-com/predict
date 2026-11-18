// Central domain-event taxonomy, shared by every app/package that emits or
// consumes them (apps/web today, apps/automation later). Extend this list as
// new lifecycle milestones are added — it is intentionally an open list, not
// a closed one tied to a single feature.
export const DomainEventType = {
  LEAD_CAPTURED: "LEAD_CAPTURED",
  // A lead form was filled in (Meta ad, Google ad, website). Fires for every
  // submission, including from a contact we already had — LEAD_CAPTURED fires
  // only the first time we hear of someone.
  LEAD_FORM_SUBMITTED: "LEAD_FORM_SUBMITTED",
  // Routed to a person or a role's pool (Setup -> Lead routing), or reassigned.
  LEAD_ASSIGNED: "LEAD_ASSIGNED",
  // A lead nobody has worked within the first-response window.
  LEAD_UNWORKED: "LEAD_UNWORKED",
  // The time a caller promised to ring back has arrived.
  CALLBACK_DUE: "CALLBACK_DUE",
  // They asked us to stop. Consent is switched off with it.
  CONTACT_OPTED_OUT: "CONTACT_OPTED_OUT",
  // A call disposition was set. Fires alongside the per-status event below;
  // use this one only for "any change" (e.g. logging), and the specific one
  // to send the message that fits the status.
  LEAD_STATUS_CHANGED: "LEAD_STATUS_CHANGED",
  // One per LeadStatus (./lead-status.ts) — keep the two lists in step.
  LEAD_STATUS_NEW: "LEAD_STATUS_NEW",
  LEAD_STATUS_CONTACTED: "LEAD_STATUS_CONTACTED",
  LEAD_STATUS_NO_ANSWER: "LEAD_STATUS_NO_ANSWER",
  LEAD_STATUS_NOT_REACHABLE: "LEAD_STATUS_NOT_REACHABLE",
  LEAD_STATUS_CALLBACK_LATER: "LEAD_STATUS_CALLBACK_LATER",
  LEAD_STATUS_INFO_SENT: "LEAD_STATUS_INFO_SENT",
  LEAD_STATUS_INTERESTED: "LEAD_STATUS_INTERESTED",
  LEAD_STATUS_BUDGET_ISSUE: "LEAD_STATUS_BUDGET_ISSUE",
  LEAD_STATUS_APPOINTMENT_BOOKED: "LEAD_STATUS_APPOINTMENT_BOOKED",
  LEAD_STATUS_APPOINTMENT_CONFIRMED: "LEAD_STATUS_APPOINTMENT_CONFIRMED",
  LEAD_STATUS_APPOINTMENT_MISSED: "LEAD_STATUS_APPOINTMENT_MISSED",
  LEAD_STATUS_APPOINTMENT_CANCELLED: "LEAD_STATUS_APPOINTMENT_CANCELLED",
  LEAD_STATUS_VISITED: "LEAD_STATUS_VISITED",
  LEAD_STATUS_NOT_INTERESTED: "LEAD_STATUS_NOT_INTERESTED",
  LEAD_STATUS_OUT_OF_AREA: "LEAD_STATUS_OUT_OF_AREA",
  LEAD_STATUS_INVALID_NUMBER: "LEAD_STATUS_INVALID_NUMBER",
  LEAD_STATUS_DUPLICATE: "LEAD_STATUS_DUPLICATE",
  LEAD_STATUS_LOST: "LEAD_STATUS_LOST",
  PATIENT_REGISTERED: "PATIENT_REGISTERED",
  PATIENT_ONBOARDED: "PATIENT_ONBOARDED",
  REPORT_UPLOADED: "REPORT_UPLOADED",
  BIOMARKER_CALCULATED: "BIOMARKER_CALCULATED",
  BIOLOGICAL_AGE_READY: "BIOLOGICAL_AGE_READY",
  ORGAN_AGE_READY: "ORGAN_AGE_READY",
  COACH_ASSIGNED: "COACH_ASSIGNED",
  DOCTOR_ASSIGNED: "DOCTOR_ASSIGNED",
  PAYMENT_SUCCESS: "PAYMENT_SUCCESS",
  // A recorded payment cancelled. Emitted rather than deleting the row, so a
  // ledger that was reconciled yesterday can be re-reconciled today.
  PAYMENT_VOIDED: "PAYMENT_VOIDED",
  // A doctor chose a package at the end of an assessment. Not the same as
  // enrolment: nothing is scheduled and nothing is owed until the advance is
  // paid and the course is activated.
  PLAN_PRESCRIBED: "PLAN_PRESCRIBED",
  APPOINTMENT_REQUESTED: "APPOINTMENT_REQUESTED",
  APPOINTMENT_CREATED: "APPOINTMENT_CREATED",
  APPOINTMENT_CONFIRMED: "APPOINTMENT_CONFIRMED",
  APPOINTMENT_COMPLETED: "APPOINTMENT_COMPLETED",
  // A booked visit that did not happen. Previously neither of these emitted
  // anything at all, so a no-show was completely silent: no event, no task,
  // and the contact stayed marked as converted forever with no visit behind
  // it. They exist so a flow can put that person back into nurture.
  APPOINTMENT_NO_SHOW: "APPOINTMENT_NO_SHOW",
  APPOINTMENT_CANCELLED: "APPOINTMENT_CANCELLED",
  // The visit moved to another time. Payload: appointmentId, scheduledAt (new), previousScheduledAt.
  APPOINTMENT_RESCHEDULED: "APPOINTMENT_RESCHEDULED",
  MEDICINE_MISSED: "MEDICINE_MISSED",
  DEVICE_SYNCED: "DEVICE_SYNCED",
  AI_CHAT_COMPLETED: "AI_CHAT_COMPLETED",
  FOLLOWUP_REQUIRED: "FOLLOWUP_REQUIRED",
  COMMUNICATION_DELIVERED: "COMMUNICATION_DELIVERED",
  COMMUNICATION_REPLIED: "COMMUNICATION_REPLIED",
  COMMUNICATION_BUTTON_CLICKED: "COMMUNICATION_BUTTON_CLICKED",
  MANUAL_MESSAGE_SENT: "MANUAL_MESSAGE_SENT",
  // The AI answered a reply no flow branch or keyword handled.
  AI_REPLY_SENT: "AI_REPLY_SENT",
  // The AI would not answer — it needs a person (asked for a price it does
  // not know, a complaint, anything clinical).
  AI_HANDOFF_REQUESTED: "AI_HANDOFF_REQUESTED",
  // A course was sold. This — not an attended consultation — is what makes
  // somebody a patient, so it is the event a welcome or onboarding flow
  // should trigger on.
  PLAN_ENROLLED: "PLAN_ENROLLED",
  PLAN_COMPLETED: "PLAN_COMPLETED",
  // One day of a course answered, in clinic or at home. Carries the source,
  // because a patient ticking their own home therapy and a therapist
  // recording a visit are not the same evidence.
  SITTING_LOGGED: "SITTING_LOGGED",
  CONTACT_STAGE_CHANGED: "CONTACT_STAGE_CHANGED",
  CONTACT_ENGAGEMENT_CHANGED: "CONTACT_ENGAGEMENT_CHANGED",
} as const;

export type DomainEventType =
  (typeof DomainEventType)[keyof typeof DomainEventType];
