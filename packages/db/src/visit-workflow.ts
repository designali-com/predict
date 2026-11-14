// A new patient's journey through the clinic, from the front desk to a course
// of treatment — and, more to the point, what is blocking it right now.
//
// The order is fixed by how the clinic actually runs:
//
//   1. Receptionist books the appointment.
//   2. Receptionist fills the first page of the registration form.
//   3. Patient pays the consultation fee.
//   4. Only then does the visit appear on the doctor's panel.
//   5. Doctor completes the rest of registration, the questionnaire, the
//      measurements, and a provisional diagnosis.
//   6. Doctor prescribes a limb package.
//   7. Nutritionist consultation, on the same profile.
//   8. Receptionist collects the treatment plan payment — part payment is
//      allowed, but the advance on the plan is the floor.
//
// The stage is DERIVED, never stored. A status column would be a second place
// the truth lives, and the first time a payment is voided or a form reopened it
// would disagree with the rows underneath it — and the screens would argue
// about whose patient this is. Everything below is computed from facts that
// exist anyway: a submitted form, a payment, a prescription.

export const VisitStage = {
  /** Booked. Nothing filled in yet. */
  BOOKED: "booked",
  /** The receptionist still has the first page of Form I to complete. */
  REGISTRATION: "registration",
  /** Registered, consultation fee outstanding. The doctor cannot see them. */
  FEE_DUE: "fee_due",
  /** Paid. With the doctor, forms outstanding. */
  WITH_DOCTOR: "with_doctor",
  /** Doctor is done but has not prescribed a package. */
  ASSESSED: "assessed",
  /** Package chosen, nutritionist consultation outstanding. */
  WITH_NUTRITIONIST: "with_nutritionist",
  /** Everything clinical is done; the advance on the plan is outstanding. */
  PLAN_PAYMENT_DUE: "plan_payment_due",
  /** Advance paid, sittings scheduled, course running. */
  IN_TREATMENT: "in_treatment",
} as const;

export type VisitStage = (typeof VisitStage)[keyof typeof VisitStage];

export interface VisitStageMeta {
  stage: VisitStage;
  label: string;
  /** Whose move it is. This is the column a worklist groups by. */
  owner: "receptionist" | "doctor" | "nutritionist" | "none";
  /** What has to happen for this to advance, in one line. */
  waitingOn: string;
}

export const VISIT_STAGES: VisitStageMeta[] = [
  {
    stage: "booked",
    label: "Booked",
    owner: "receptionist",
    waitingOn: "Start the registration form",
  },
  {
    stage: "registration",
    label: "Registering",
    owner: "receptionist",
    waitingOn: "Finish page 1 of the registration form",
  },
  {
    stage: "fee_due",
    label: "Fee due",
    owner: "receptionist",
    waitingOn: "Collect the consultation fee — the doctor cannot see them until it is paid",
  },
  {
    stage: "with_doctor",
    label: "With doctor",
    owner: "doctor",
    waitingOn: "Complete registration, questionnaire, measurements and provisional diagnosis",
  },
  {
    stage: "assessed",
    label: "Assessed",
    owner: "doctor",
    waitingOn: "Prescribe a treatment package",
  },
  {
    stage: "with_nutritionist",
    label: "With nutritionist",
    owner: "nutritionist",
    waitingOn: "Complete the nutrition consultation",
  },
  {
    stage: "plan_payment_due",
    label: "Plan payment due",
    owner: "receptionist",
    waitingOn: "Collect the advance on the prescribed plan",
  },
  {
    stage: "in_treatment",
    label: "In treatment",
    owner: "none",
    waitingOn: "Sittings are running",
  },
];

export function visitStageMeta(stage: string): VisitStageMeta | undefined {
  return VISIT_STAGES.find((s) => s.stage === stage);
}

/** The facts a stage is read off. Every one of them is a row that exists anyway. */
export interface VisitFacts {
  /** Page 1 of Form I, submitted by the front desk. */
  registrationDone: boolean;
  /** Consultation fee settled in full. */
  feePaid: boolean;
  /** Every form the doctor owns has been submitted. */
  doctorFormsDone: boolean;
  /** A package has been prescribed for this visit. */
  planPrescribed: boolean;
  /** The nutrition consultation form has been submitted. */
  nutritionDone: boolean;
  /** At least the advance on the prescribed plan has been collected. */
  advancePaid: boolean;
}

/**
 * Where this visit has got to.
 *
 * Read backwards, most-advanced first: a patient who is in treatment is in
 * treatment whatever else is outstanding behind them, and a forward scan would
 * park them on the first gap instead. Gaps behind the front are real and worth
 * seeing, but they are a to-do list, not the stage.
 */
export function visitStage(facts: VisitFacts): VisitStage {
  // Treatment starts when the plan is prescribed, the nutritionist has seen
  // them, AND the money condition is met — all three.
  //
  // The nutrition clause used to be missing here, and on a plan with a 0%
  // advance that was enough to skip two whole steps: nothing was owed, so
  // advancePaid was already true the moment the doctor prescribed, and the
  // visit jumped from the doctor straight to in_treatment. The nutritionist
  // never saw the patient and the desk was never asked for the money.
  if (facts.planPrescribed && facts.nutritionDone && facts.advancePaid) {
    return VisitStage.IN_TREATMENT;
  }
  if (facts.planPrescribed && facts.nutritionDone) return VisitStage.PLAN_PAYMENT_DUE;
  if (facts.planPrescribed) return VisitStage.WITH_NUTRITIONIST;
  if (facts.doctorFormsDone) return VisitStage.ASSESSED;
  if (facts.feePaid) return VisitStage.WITH_DOCTOR;
  if (facts.registrationDone) return VisitStage.FEE_DUE;
  return VisitStage.BOOKED;
}

/**
 * Can the clinical side see this visit at all?
 *
 * This is the gate the clinic asked for: a visit with the consultation fee
 * outstanding does not reach the doctor's panel. It is enforced server-side in
 * the appointment queries, not by hiding a row in a template — a doctor who
 * types the URL must get the same answer as one who reads the list.
 */
export function visibleToClinicians(facts: VisitFacts): boolean {
  return facts.feePaid;
}
