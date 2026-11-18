// What kind of visit this is — and it is not a label somebody picks.
//
// A visit is a therapy day if a plan_sitting points at it. That is a fact with
// a course, a day number and a paid-for place behind it, and it cannot be set
// wrong. Adding "therapy" to the appointment type dropdown would have been
// quicker and worse: you would get visits marked therapy belonging to no
// course, and sittings with no visit, and the two lists disagreeing about
// whether day 9 happened — which is exactly what one shared sitting row was
// built to prevent.
//
// Everything else is what the clinician chose it to be:
//
//   consultation — the first assessment, before any course exists
//   review       — mid-course, usually a week or so in. Blood may be taken at
//                  it, and often is not; see the note on `bloodTaken` below.
//
// There used to be a third, tele_consult, and it was a mistake: it answered
// "how does this happen" inside the column for "what is this". The visit
// already carries `channel` (virtual | in_clinic), so a tele-consult is a
// consultation with channel=virtual — and a REVIEW can now be over video too,
// which it could not be while picking review threw the video away.
//
// A review is deliberately NOT a sitting. It does not consume one of the days
// the patient paid for, so booking one must never decrement the course.

export const VisitKind = {
  THERAPY: "therapy",
  CONSULTATION: "consultation",
  REVIEW: "review",
} as const;

export type VisitKind = (typeof VisitKind)[keyof typeof VisitKind];

export const VISIT_KIND_LABEL: Record<VisitKind, string> = {
  therapy: "Therapy",
  consultation: "Consultation",
  review: "Review consultation",
};

/** The types a person may choose when booking. Therapy is never among them. */
export const BOOKABLE_TYPES: { value: string; label: string; caption: string }[] = [
  {
    value: "consultation",
    label: "Consultation",
    caption: "First assessment, before any course",
  },
  {
    value: "review",
    label: "Review consultation",
    caption: "Mid-course check — does not use up a sitting",
  },
];

export interface VisitKindInput {
  /** appointment.type as stored. */
  type: string;
  /** The sitting this visit was booked for, if any. */
  sitting?: { dayNumber: number; enrollmentId: string } | null;
  /** The course, for a review booked against one. */
  enrollment?: { planName: string; sittings: number; isPerSession?: boolean } | null;
}

export interface VisitKindResult {
  kind: VisitKind;
  label: string;
  /** "Therapy · day 9 of 21" — the whole answer in one line. */
  detail: string;
  /** True when this visit consumes a sitting the patient paid for. */
  consumesSitting: boolean;
}

/**
 * What this visit is, in the words the desk would use.
 *
 * The day number is the point of the therapy case. "Therapy" alone tells a
 * receptionist nothing she did not already know from the patient standing in
 * front of her; "day 9 of 21" tells her whether they are nearly finished.
 */
export function visitKind(input: VisitKindInput): VisitKindResult {
  if (input.sitting) {
    // An open-ended course has no total to be a fraction of — "day 3 of 3"
    // reads as finished when they may be back on Thursday for a fourth.
    const total = input.enrollment?.isPerSession ? null : input.enrollment?.sittings;
    const of = total ? ` of ${total}` : "";
    const plan = input.enrollment?.planName ? ` · ${input.enrollment.planName}` : "";
    return {
      kind: VisitKind.THERAPY,
      label: VISIT_KIND_LABEL.therapy,
      detail: input.enrollment?.isPerSession
        ? `Therapy · session ${input.sitting.dayNumber}${plan}`
        : `Therapy · day ${input.sitting.dayNumber}${of}${plan}`,
      consumesSitting: true,
    };
  }

  const kind: VisitKind =
    input.type === "review" ? VisitKind.REVIEW : VisitKind.CONSULTATION;

  // A review during a course says which course, so it does not read as an
  // unrelated appointment that happens to fall in the middle of one.
  const during =
    kind === VisitKind.REVIEW && input.enrollment ? ` · during ${input.enrollment.planName}` : "";

  return {
    kind,
    label: VISIT_KIND_LABEL[kind],
    detail: `${VISIT_KIND_LABEL[kind]}${during}`,
    consumesSitting: false,
  };
}

/**
 * Blood tests are never implied by a visit.
 *
 * Most patients on a course never have one, a review consultation may or may
 * not take blood, and a patient can go for a test on a day with no appointment
 * at all and carry on with therapy the same week. So there is no "review means
 * bloods" rule anywhere: a report exists when a report is uploaded, dated by
 * when the sample was taken (report.collectedOn), and the biological clock
 * reads those. Nothing here creates, requires or waits for one.
 */
export const BLOOD_TEST_IS_OPTIONAL = true;
