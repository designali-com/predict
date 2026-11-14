// The clinic's paper forms, as definitions rather than as columns.
//
// FORM-I registration, FORM-II questionnaires, FORM-III measurements, and the
// provisional diagnosis. Each is a printed document the clinic revises, so the
// questions live here and the answers live in one JSONB column — a reprint is
// an edit to this file, not a migration, and old submissions keep rendering
// against the version they were filled in under.
//
// Transcribed from the clinic's own PDFs and, for the nutrition sheet, from the
// spreadsheet the clinic works off. Where the paper and the screen differ it is
// noted at the field: FORM-III's WHtR row divides by height rather than the
// "Wt" printed on it (see form-scoring.ts), the provisional diagnosis sheet's
// three unlabelled columns are rendered as one note per condition until
// somebody says what they were for, and the nutrition sheet's blank rows are
// left out rather than guessed at.
//
// Who fills what comes from how the clinic actually runs: page 1 of FORM-I at
// the counter before the consultation fee, everything else after it.

import { INDIAN_REGIONS } from "./india-regions";

export const FormOwner = {
  RECEPTIONIST: "receptionist",
  DOCTOR: "doctor",
  NUTRITIONIST: "nutritionist",
} as const;

export type FormOwner = (typeof FormOwner)[keyof typeof FormOwner];

/** In the order the visit runs through them. */
export const FORM_OWNERS: FormOwner[] = [
  FormOwner.RECEPTIONIST,
  FormOwner.DOCTOR,
  FormOwner.NUTRITIONIST,
];

/**
 * Which permissions may SUBMIT a form of each kind.
 *
 * Here rather than in the route so the API and the screen cannot disagree:
 * a form offered to somebody the server will refuse is worse than one that
 * was never shown.
 *
 * Note these do not separate a doctor from a nutritionist — both hold the
 * same two grants. Which forms an account actually fills is decided by role;
 * see /api/staff/me. This is the outer bound, not the answer.
 */
/**
 * Which job this account does, for the parts of the visit that belong to a
 * job rather than to a page.
 *
 * By ROLE first, because permission cannot answer it: a doctor and a
 * nutritionist hold exactly the same two grants and do completely different
 * things with them. A role the clinic invented falls back to permissions — a
 * worse answer, but the only one available for a job nothing here has heard
 * of. An unrestricted account does every job, because it is the owner of
 * last resort.
 *
 * Shared by the screen and the API on purpose: a button offered to somebody
 * the server will refuse is worse than one that was never shown.
 */
export function formOwnersFor(
  role: string,
  held: Set<string>,
  unrestricted: boolean,
): FormOwner[] {
  if (unrestricted) return [...FORM_OWNERS];
  if (FORM_OWNERS.includes(role as FormOwner)) return [role as FormOwner];
  return FORM_OWNERS.filter((owner) =>
    (FORM_WRITE_PERMISSIONS[owner] ?? []).some((key) => held.has(key)),
  );
}

/**
 * Who may prescribe a treatment package: the doctor, and the front desk —
 * at OPTM the receptionist writes up the package the doctor decided on, as
 * the clinic's old system had her do. Not the nutritionist. The panel and
 * the enrolments API both ask this, so the button and the server agree.
 */
export const PRESCRIBERS: FormOwner[] = ["doctor", "receptionist"];
export const mayPrescribe = (owners: readonly string[]): boolean =>
  owners.some((owner) => (PRESCRIBERS as string[]).includes(owner));

export const FORM_WRITE_PERMISSIONS: Record<FormOwner, string[]> = {
  receptionist: ["clinic.appointments", "clinic.patients"],
  doctor: ["clinic.patients", "clinic.appointments"],
  nutritionist: ["clinic.patients", "clinic.appointments"],
};

export const FieldType = {
  TEXT: "text",
  TEXTAREA: "textarea",
  NUMBER: "number",
  DATE: "date",
  SELECT: "select",
  /** Several answers from a fixed list — a row of tick boxes on paper. */
  MULTI: "multi",
  /** Yes / no, kept apart from select so it renders as a pair. */
  BOOLEAN: "boolean",
  /** Derived and read-only — BMI, the WOMAC percentages. */
  COMPUTED: "computed",
  /** Added one at a time: which meal, when, and what was eaten. */
  RECALL: "recall",
} as const;

export type FieldType = (typeof FieldType)[keyof typeof FieldType];

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  /** Shown after the input — "cm", "kg", "mmHg". */
  unit?: string;
  /** The reference range printed on the form, shown beside the input. */
  normal?: string;
  help?: string;
  /** Takes the full row rather than half of it. */
  wide?: boolean;
  /**
   * Only ask this once another field has been answered.
   *
   * The paper form asks everything at once because paper cannot do better.
   * A screen can: five follow-up questions about a referral are noise until
   * somebody has said there was one, and a blank answer to a question that
   * was never relevant is indistinguishable from one that was skipped.
   *
   * `equals` narrows it further — shown only for those answers.
   */
  showWhen?: { field: string; equals?: string[] };
}

export interface FormSection {
  title: string;
  /** The lettered part on the paper — "PART-A", "page 2". */
  printedAs?: string;
  description?: string;
  fields: FormField[];
}

export interface FormDefinition {
  key: string;
  /** Bumped when the questions change, and stamped onto every submission. */
  version: number;
  title: string;
  printedAs?: string;
  owner: FormOwner;
  description: string;
  /**
   * This form's own printed consent wording, for the consent block at its
   * foot. Only set where the paper carries specific wording — everything
   * else uses the clinic-wide text from the clinic profile.
   */
  consentText?: string;
  sections: FormSection[];
}

export function formFields(form: FormDefinition): FormField[] {
  return form.sections.flatMap((s) => s.fields);
}

/**
 * Whether a field is being asked, given what has been answered so far.
 *
 * Shared by the renderer and the required-fields check on purpose. Two
 * separate notions of "is this on screen" is how a form comes to refuse a
 * submission over a box nobody can see.
 */
export function isFieldVisible(
  field: FormField,
  answers: Record<string, unknown>,
  /** Every field on the form, so a chain of conditions collapses as one. */
  all?: FormField[],
  seen: Set<string> = new Set(),
): boolean {
  const rule = field.showWhen;
  if (!rule) return true;

  // "If yes, when" hangs off "was the referral treated here", which hangs
  // off "referred by". Clearing the first has to take all three away — not
  // leave the deepest two on screen under a question that is gone. The seen
  // set stops a definition that points at itself from looping forever.
  if (all && !seen.has(field.key)) {
    seen.add(field.key);
    const parent = all.find((f) => f.key === rule.field);
    if (parent && !isFieldVisible(parent, answers, all, seen)) return false;
  }

  const value = answers[rule.field];
  const answered = Array.isArray(value)
    ? value.length > 0
    : value !== undefined && value !== null && String(value).trim() !== "";

  if (!answered) return false;
  if (!rule.equals?.length) return true;
  return rule.equals.includes(String(value));
}

/** A form nobody has written the questions for yet cannot be filled in. */
export function isFormReady(form: FormDefinition): boolean {
  return formFields(form).some((f) => f.type !== FieldType.COMPUTED);
}

// ── Shared option lists ────────────────────────────────────────────────────

/** "0" … "50". A select takes strings, and fifty of them are not worth typing. */
function range(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
}

const SIDES = ["Right", "Left", "Bilateral"];
const YES_NO_UNKNOWN = ["Yes", "No", "Not known"];
const SEVERITY = ["None", "Mild", "Moderate", "Severe", "Extreme"];

// The Ganguly scale, lettered exactly as the form prints it.
const GANGULY = [
  "A — Extremely",
  "B — Very much",
  "C — Moderate",
  "D — Slight",
  "E — Not reported",
];

/** A body region that can be affected on one side, the other, or both. */
function sided(key: string, label: string): FormField {
  return { key, label, type: FieldType.SELECT, options: SIDES };
}

/** One WOMAC item: the question, and the five-point answer. */
function womac(key: string, label: string, koos: string): FormField {
  return {
    key,
    label,
    type: FieldType.SELECT,
    options: SEVERITY,
    // The KOOS item this maps to, printed in the last column of the form.
    help: `KOOS ${koos}`,
  };
}

/** A measurement taken on both sides — two fields, one per limb. */
function bilateral(
  key: string,
  label: string,
  unit: string,
  normal: string | undefined,
  leftLabel: string,
  rightLabel: string,
): FormField[] {
  return [
    { key: `${key}_right`, label: `${label} — ${rightLabel}`, type: FieldType.NUMBER, unit, normal },
    { key: `${key}_left`, label: `${label} — ${leftLabel}`, type: FieldType.NUMBER, unit, normal },
  ];
}

const leg = (key: string, label: string, unit: string) =>
  bilateral(key, label, unit, undefined, "left leg", "right leg");
const hand = (key: string, label: string, unit: string) =>
  bilateral(key, label, unit, undefined, "left hand", "right hand");

export const CLINICAL_FORMS: FormDefinition[] = [
  // ══ FORM I, page 1 — the front desk ══════════════════════════════════════
  {
    key: "registration_front_desk",
    version: 1,
    title: "Registration",
    printedAs: "FORM NO. I — page 1",
    owner: FormOwner.RECEPTIONIST,
    description:
      "Who the patient is, who sent them, and what they have come in with. Filled at the counter before the consultation fee is taken.",
    sections: [
      {
        title: "Patient",
        fields: [
          { key: "last_name", label: "Last name", type: "text", required: true },
          { key: "first_name", label: "First name", type: "text", required: true },
          { key: "dob", label: "Date of birth", type: "date" },
          { key: "age", label: "Age", type: "number", unit: "years" },
          // The printed form has two boxes. A third is added here because a
          // patient who is neither should not have to be recorded as one of
          // them to be seen — and "Other" is what patient_record.gender already
          // stores for exactly this case.
          {
            key: "sex",
            label: "Sex",
            type: "select",
            options: ["Female", "Male", "LGBTQ+"],
            required: true,
          },
          // Split to match patient_address (line1/line2/city/state/pincode).
          // One free-text box cannot be searched by city, cannot be posted to,
          // and cannot be copied onto the chart without somebody re-typing it.
          { key: "address_line1", label: "Address line 1", type: "text", wide: true },
          { key: "address_line2", label: "Address line 2", type: "text", wide: true },
          { key: "city", label: "City", type: "text" },
          // A list, not free text: typed by hand this becomes "UP", "U.P."
          // and "Uttar Pradesh" as three different places.
          { key: "state", label: "State", type: "select", options: INDIAN_REGIONS },
          { key: "pin_code", label: "PIN code", type: "text" },
          { key: "phone_no", label: "Phone number", type: "text", required: true },
        ],
      },
      {
        title: "Referral",
        fields: [
          {
            key: "referred_by",
            label: "Referred by",
            type: "select",
            options: [
              "Doctor",
              "Friend",
              "Relative",
              "Patient",
              "Newspaper",
              "E-Communication",
              "Walk-in",
            ],
          },
          // Everything below waits for "Referred by" — see showWhen.
          {
            key: "referral_name_1",
            label: "Name of referral (1)",
            type: "text",
            showWhen: { field: "referred_by" },
          },
          {
            key: "referral_name_2",
            label: "Name of referral (2)",
            type: "text",
            showWhen: { field: "referred_by" },
          },
          {
            key: "referral_treated_here",
            label: "Is / was the referral treated in clinic",
            type: "select",
            options: YES_NO_UNKNOWN,
            showWhen: { field: "referred_by" },
          },
          // These two follow from the answer above, not from the referral
          // itself: "when were they treated" makes no sense until somebody
          // has said they were.
          {
            key: "referral_treated_when",
            label: "If yes, when",
            type: "text",
            showWhen: { field: "referral_treated_here", equals: ["Yes"] },
          },
          {
            key: "referral_cured",
            label: "Was he / she cured",
            type: "text",
            showWhen: { field: "referral_treated_here", equals: ["Yes"] },
          },
        ],
      },
      {
        title: "Chief complaint",
        printedAs: "C/C present",
        fields: [
          {
            key: "chief_complaint",
            label: "Chief complaint",
            type: "multi",
            wide: true,
            options: [
              "Pain",
              "Obesity",
              "Varicose veins",
              "Urinary incontinence",
              "Swelling",
              "Stiffness",
              "Headaches",
              "Sinusitis",
              "Insomnia",
              "Reflux",
              "Acidity",
              "Indigestion",
              "Bell's palsy (facial paralysis)",
              "Paralysis",
              "Skin disorders",
              "Gynecological disorders",
              "Dysmenorrhea",
              "Cellulitis",
              "Psychosomatic disorders",
            ],
          },
          {
            key: "complaint_location",
            label: "Location",
            type: "multi",
            wide: true,
            options: [
              "Neck",
              "Arm",
              "Armpit",
              "Shoulder",
              "Elbow",
              "Back",
              "Waist",
              "Hands",
              "Fingers",
              "Groin",
              "Thigh",
              "Calf",
              "Ankle",
              "Feet",
              "Toes",
              "Knee joint",
              "Heel",
              "Hip joint",
              "Sternocleidomastoid",
              "Buttock",
              "Abdomen",
              "Forehead",
              "Thoracic",
              "Lumbar",
            ],
          },
          // Two boxes rather than one free-text one. "6 months", "6m", "half a
          // year" and "since Diwali" are all the same answer typed four ways,
          // and none of them can be compared, sorted or counted afterwards.
          {
            key: "period_of_suffering_years",
            label: "Period of suffering (years)",
            type: "select",
            options: range(0, 50),
          },
          {
            key: "period_of_suffering_months",
            // Stops at 11: twelve months is a year, and allowing both to say
            // it gives two spellings of the same duration.
            label: "Period of suffering (months)",
            type: "select",
            options: range(0, 11),
          },
        ],
      },
      {
        title: "Location of pain",
        description: "Only if pain is the chief complaint.",
        fields: [
          { key: "pain_lumbosacral_spine", label: "Lumbosacral spine", type: "boolean" },
          { key: "pain_thoracic_spine", label: "Thoracic spine", type: "boolean" },
          { key: "pain_cervical_spine", label: "Cervical spine", type: "boolean" },
          { key: "pain_chest", label: "Chest", type: "boolean" },
          sided("pain_shoulder", "Shoulder"),
          sided("pain_arm", "Arm"),
          sided("pain_hand", "Hand"),
          sided("pain_finger", "Finger"),
          sided("pain_hip", "Hip"),
          sided("pain_leg", "Leg"),
          sided("pain_knee", "Knee"),
          sided("pain_ankle", "Ankle"),
          sided("pain_feet", "Feet"),
          sided("pain_heel", "Heel"),
        ],
      },
    ],
  },

  // ══ FORM I, pages 2–3 — the doctor ═══════════════════════════════════════
  {
    key: "registration_clinical",
    version: 1,
    title: "Registration — clinical history",
    printedAs: "FORM NO. I — pages 2 and 3",
    owner: FormOwner.DOCTOR,
    description: "History, habits, what has already been tried, and consent.",
    // Transcribed from the printed declaration on this form. It is specific
    // to what is done at this consultation, so it is not the clinic-wide
    // wording — a nutrition sheet must not ask anybody to agree to imaging.
    consentText:
      "I consent to physical examination, to blood samples being taken, to spine and knee imaging (X-ray, CT or MRI), and to the extraction of knee joint fluid required for future studies. The information I have given is true and complete to the best of my knowledge.",
    sections: [
      {
        title: "Factors that precipitate pain",
        fields: [
          {
            key: "pain_factors",
            label: "Precipitating factors",
            type: "multi",
            wide: true,
            options: [
              "Changing weather",
              "Fatigue",
              "Movement / overuse",
              "Stress",
              "Hormonal changes",
              "Cold",
              "Heat",
              "Humidity",
              "Static position",
              "Allergy",
              "Others",
            ],
          },
          {
            key: "emotions_contribute",
            label: "Do emotions contribute to the severity of symptoms and functional limitations",
            type: "boolean",
            wide: true,
          },
        ],
      },
      {
        title: "Associated manifestations and comorbidities",
        fields: [
          {
            key: "comorbidities",
            label: "Associated manifestations",
            type: "multi",
            wide: true,
            options: [
              "Sweating",
              "Nausea",
              "Vomiting",
              "Acidity",
              "Reflux",
              "Dizziness",
              "Anaemia",
              "Insomnia",
              "Tiredness",
              "Fatigue",
              "Depression",
              "Anxiety",
              "Muscle wasting",
              "Weight loss",
              "Weight gain",
              "Appetite loss",
              "Indigestion",
              "Constipation",
              "Varicose vein",
              "Urinary incontinence",
              "Dysmenorrhea",
              "Leucorrhea",
              "Skin allergy",
              "Crepitus during knee flexion",
              "Morning stiffness (< 30 minutes)",
            ],
          },
        ],
      },
      {
        title: "Past medical history",
        fields: [
          { key: "major_adult_illness", label: "Major adult illness", type: "textarea", wide: true },
          { key: "past_surgery", label: "Surgical intervention", type: "textarea", wide: true },
          { key: "pacemaker", label: "Using a pacemaker", type: "boolean" },
        ],
      },
      {
        title: "Female reproductive system",
        description: "Where applicable.",
        fields: [
          { key: "uterus_status", label: "Status of uterus", type: "text" },
          { key: "ovary_status", label: "Status of ovary", type: "text" },
          { key: "menarche_age", label: "Menarche at the age of", type: "number", unit: "years" },
          { key: "menstruation_cycle", label: "Menstruation cycle", type: "text" },
          {
            key: "menstrual_flow",
            label: "Flow",
            type: "select",
            options: ["Normal", "Abnormal", "Heavy"],
          },
          { key: "menopause_age", label: "Menopause at the age of", type: "number", unit: "years" },
        ],
      },
      {
        title: "Dietary and other habits",
        fields: [
          {
            key: "habits",
            label: "Habits",
            type: "multi",
            wide: true,
            options: [
              "Vegetarian",
              "Non-vegetarian",
              "Excessive tea",
              "Excessive coffee",
              "Smoking",
              "Drinking alcohol",
              "Chewing tobacco",
              "Free from other habits",
            ],
          },
        ],
      },
      {
        title: "Measures already taken to diminish pain",
        fields: [
          { key: "knee_brace", label: "Using a knee brace", type: "boolean" },
          { key: "knee_brace_side", label: "Knee brace — which", type: "select", options: SIDES },
          { key: "lumbar_belt", label: "Using a lumbar belt", type: "boolean" },
          { key: "collar_belt", label: "Using a collar belt", type: "boolean" },
          { key: "stick_walker", label: "Using a stick or walker", type: "boolean" },
          { key: "nsaid", label: "Using paracetamol / NSAID", type: "boolean" },
          {
            key: "nsaid_frequency",
            label: "NSAID frequency",
            type: "select",
            options: ["Daily", "SOS"],
          },
          { key: "arthrocentesis_done", label: "Undergone arthrocentesis", type: "boolean" },
          { key: "hyaluronic_acid", label: "Use of hyaluronic acid", type: "boolean" },
          { key: "corticosteroid", label: "Use of corticosteroid injection", type: "boolean" },
          { key: "ayurveda", label: "Ayurveda treatment", type: "boolean" },
          { key: "homeopathy", label: "Homeopathic treatment", type: "boolean" },
          { key: "herbal_massage", label: "Massage with herbal or other gels", type: "boolean" },
        ],
      },
      {
        title: "Supplements taken to reduce pain or improve fitness",
        fields: [
          { key: "supp_calcium", label: "Calcium", type: "boolean" },
          { key: "supp_vitamin_d", label: "Vitamin D", type: "boolean" },
          { key: "supp_glucosamine", label: "Glucosamine", type: "boolean" },
          {
            key: "supp_glucosamine_chondroitin",
            label: "Glucosamine and chondroitin",
            type: "boolean",
          },
        ],
      },
      {
        title: "Surgical intervention",
        fields: [
          { key: "surg_tkr", label: "Total knee replacement", type: "select", options: SIDES },
          { key: "surg_tkr_on", label: "Undergone on", type: "date" },
          { key: "surg_arthrocentesis", label: "Arthrocentesis", type: "select", options: SIDES },
          { key: "surg_arthrocentesis_on", label: "Undergone on", type: "date" },
          {
            key: "surg_lumbar",
            label: "Lumbar region",
            type: "multi",
            wide: true,
            options: [
              "Laminectomy (spinal decompression)",
              "Spinal fusion",
              "Artificial disk replacement",
            ],
          },
          { key: "surg_lumbar_on", label: "Undergone on", type: "date" },
          {
            key: "surg_cervical",
            label: "Cervical region",
            type: "multi",
            wide: true,
            options: ["Laminoplasty", "Laminectomy", "Artificial disc replacement"],
          },
          { key: "surg_cervical_on", label: "Undergone on", type: "date" },
          { key: "surg_cabg_on", label: "Bypass surgery (CABG) undergone on", type: "date" },
          {
            key: "surg_varicose",
            label: "Varicose vein",
            type: "multi",
            wide: true,
            options: ["Venous ablation", "Phlebectomy", "Other methods"],
          },
          { key: "surg_varicose_on", label: "Undergone on", type: "date" },
          {
            key: "surg_carpal_tunnel",
            label: "Carpal tunnel (endoscopic release)",
            type: "select",
            options: ["Right hand", "Left hand", "Bilateral"],
          },
          { key: "surg_carpal_tunnel_on", label: "Undergone on", type: "date" },
        ],
      },
      {
        title: "Present history",
        fields: [{ key: "present_history", label: "Present history", type: "textarea", wide: true }],
      },
    ],
  },

  // ══ FORM II — questionnaires ═════════════════════════════════════════════
  {
    key: "questionnaire",
    version: 1,
    title: "Pain outcome questionnaires",
    printedAs: "FORM NO. II",
    owner: FormOwner.DOCTOR,
    description:
      "Internationally approved pain-related outcome measurements: the Ganguly pain sensation scale and the WOMAC index.",
    sections: [
      {
        title: "Pain sensation",
        printedAs: "PART-A — Ganguly scale",
        fields: [
          { key: "ganguly_knee_right", label: "Knee joint — right", type: "select", options: GANGULY },
          { key: "ganguly_knee_left", label: "Knee joint — left", type: "select", options: GANGULY },
          { key: "ganguly_lumbar", label: "Lumbar region", type: "select", options: GANGULY },
          { key: "ganguly_cervical", label: "Cervical region", type: "select", options: GANGULY },
          { key: "ganguly_heel", label: "Heel region", type: "select", options: GANGULY },
        ],
      },
      {
        title: "WOMAC — pain",
        printedAs: "PART-B I (range 0–20)",
        description: "Thinking of the knee symptoms during the last 48 hours.",
        fields: [
          womac("womac_p1", "When walking on a flat surface", "P5"),
          womac("womac_p2", "When going up or down stairs", "P6"),
          womac("womac_p3", "At night while in bed", "P7"),
          womac("womac_p4", "While sitting or lying down", "P8"),
          womac("womac_p5", "While standing", "P9"),
          {
            key: "womac_pain_percent",
            label: "% of pain",
            type: "computed",
            help: "Total score earned ÷ 20 × 100",
            wide: true,
          },
        ],
      },
      {
        title: "WOMAC — stiffness",
        printedAs: "PART-B II (range 0–8)",
        description: "Thinking of the knee symptoms during the last 48 hours.",
        fields: [
          womac("womac_s1", "How severe has your stiffness been after you first woke up in the morning", "S6"),
          womac(
            "womac_s2",
            "How severe has your stiffness been after sitting, lying down or resting later in the day",
            "S7",
          ),
          {
            key: "womac_stiffness_percent",
            label: "% of stiffness",
            type: "computed",
            help: "Total score earned ÷ 8 × 100",
            wide: true,
          },
        ],
      },
      {
        title: "WOMAC — difficulty performing daily activities",
        printedAs: "PART-B III (range 0–68)",
        description: "Thinking of the knee symptoms during the last 48 hours.",
        fields: [
          womac("womac_a1", "When going down the stairs", "A1"),
          womac("womac_a2", "When going up the stairs", "A2"),
          womac("womac_a3", "When getting up from a sitting position", "A3"),
          womac("womac_a4", "While standing", "A4"),
          womac("womac_a5", "When bending to the floor", "A5"),
          womac("womac_a6", "When walking on a flat surface", "A6"),
          womac("womac_a7", "Getting in or out of a car, or on or off a bus", "A7"),
          womac("womac_a8", "While going shopping", "A8"),
          womac("womac_a9", "When putting on socks, panty hose or stockings", "A9"),
          womac("womac_a10", "When getting out of bed", "A10"),
          womac("womac_a11", "When taking off socks, panty hose or stockings", "A11"),
          womac("womac_a12", "When lying in bed", "A12"),
          womac("womac_a13", "When getting in or out of the bathtub", "A13"),
          womac("womac_a14", "While sitting", "A14"),
          womac("womac_a15", "When getting on or off the toilet", "A15"),
          womac("womac_a16", "While doing heavy household chores", "A16"),
          womac("womac_a17", "While doing light household chores", "A17"),
          {
            key: "womac_function_percent",
            label: "% of functional activities",
            type: "computed",
            help: "Total score earned ÷ 68 × 100",
            wide: true,
          },
          {
            key: "womac_total_percent",
            label: "Total WOMAC score",
            type: "computed",
            help: "(Pain + stiffness + functional activities) ÷ 96 × 100",
            wide: true,
          },
        ],
      },
    ],
  },

  // ══ FORM III — measurements ══════════════════════════════════════════════
  {
    key: "measurements",
    version: 1,
    title: "Measurements of significant present medical parameters",
    printedAs: "FORM NO. III",
    owner: FormOwner.DOCTOR,
    description: "To be measured by the examiner, physiotherapist or doctor.",
    sections: [
      {
        title: "Vital signs",
        printedAs: "PART-A",
        fields: [
          {
            key: "body_temperature",
            label: "Body temperature",
            type: "number",
            unit: "°C",
            normal: "37 °C",
          },
          {
            key: "spo2",
            label: "Blood oxygen level (SpO₂)",
            type: "number",
            unit: "%",
            normal: "95% or higher",
          },
          {
            key: "pulse_rate",
            label: "Pulse rate",
            type: "number",
            unit: "b/m",
            normal: "60–100 beats/minute",
          },
          {
            key: "respiration_rate",
            label: "Respiration rate",
            type: "number",
            unit: "/m",
            normal: "12–20 /m",
          },
          // Systolic and diastolic separately: "120/80" in one text box cannot
          // be charted, compared, or checked against a range.
          {
            key: "bp_systolic",
            label: "Blood pressure — systolic",
            type: "number",
            unit: "mmHg",
            normal: "100–120",
          },
          {
            key: "bp_diastolic",
            label: "Blood pressure — diastolic",
            type: "number",
            unit: "mmHg",
            normal: "60–80",
          },
          {
            key: "blood_glucose",
            label: "Blood glucose (random)",
            type: "number",
            unit: "mg/dl",
            normal: "99–100 mg/dl",
            help: "On request, with a blood glucose meter",
          },
        ],
      },
      {
        title: "Anthropometric",
        printedAs: "PART-B",
        fields: [
          {
            key: "height_cm",
            label: "Height",
            type: "number",
            unit: "cm",
            normal: "M 171 cm / F 151 cm",
          },
          { key: "weight_kg", label: "Weight", type: "number", unit: "kg", normal: "M 65 / F 55 kg" },
          {
            key: "waist_cm",
            label: "Circumference of waist (WC)",
            type: "number",
            unit: "cm",
            normal: "M 102 / F 88 cm",
          },
          {
            key: "hip_cm",
            label: "Circumference of hip (HC)",
            type: "number",
            unit: "cm",
            normal: "M 94–106 / F 97–108 cm",
          },
          {
            key: "bmi",
            label: "BMI",
            type: "computed",
            unit: "kg/m²",
            normal: "≤ 25–30 kg/m²",
            help: "Weight ÷ height²",
          },
          {
            key: "whpr",
            label: "WHpR",
            type: "computed",
            normal: "M 0.87–0.99 / F 0.76–0.84",
            help: "Waist ÷ hip",
          },
          {
            key: "whtr",
            label: "WHtR",
            type: "computed",
            normal: "M 0.50 / F 0.41",
            // The paper says WC/Wt, but 102 cm ÷ 65 kg is 1.57 and the normal
            // it quotes is 0.50 — which is the standard waist-to-height cutoff.
            help: "Waist ÷ height. The printed form says WC/Wt; the normal it quotes is a waist-to-height ratio.",
          },
        ],
      },
      {
        title: "Lower extremity",
        printedAs: "PART-C",
        description: "Measured if the patient has a problem in the lower region.",
        fields: [
          ...leg("kgb", "KGB — knee gap between short head biceps femoris and the bed, supine", "cm"),
          ...leg("cap", "CAP — circumference 4 cm above the patella", "cm"),
          ...leg("cbp", "CBP — circumference 4 cm below the patella", "cm"),
          ...leg("ctm", "CTM — circumference of thigh muscles", "cm"),
          ...leg("ccm", "CCM — circumference of calf muscles", "cm"),
          ...leg("slr_s", "SLR(S) — straight leg raise, supine", "°"),
          ...leg("slr_p", "SLR(P) — straight leg raise, prone", "°"),
          ...leg("kfs", "KFS — knee flexion, supine", "°"),
          ...leg("kfp", "KFP — knee flexion, prone", "°"),
          ...leg("kfst", "KFSt — knee flexion, standing", "°"),
          ...leg("kes", "KES — knee extension, supine", "°"),
          ...leg("kep", "KEP — knee extension, prone", "°"),
          ...leg("kest", "KESt — knee extension, standing", "°"),
        ],
      },
      {
        title: "Upper extremity",
        printedAs: "PART-D",
        description: "Measured if the patient has a problem in the upper region.",
        fields: [
          ...hand("crcm", "CRCM — rotator cuff circumference, 8 cm below the acromion", "cm"),
          ...hand("ceao", "CEAO — circumference 2 cm above the olecranon", "cm"),
          ...hand("cebo", "CEBO — circumference 2 cm below the olecranon", "cm"),
          ...hand("asfs", "ASFS — shoulder (glenohumeral) flexion, supine", "°"),
          ...hand("asast", "ASASt — shoulder (glenohumeral) abduction, standing", "°"),
          ...hand("aefs", "AEFS — elbow (olecranon) flexion, supine", "°"),
          ...hand("aees", "AEES — elbow (olecranon) extension, supine", "°"),
        ],
      },
    ],
  },

  // ══ Provisional diagnosis ════════════════════════════════════════════════
  {
    key: "provisional_diagnosis",
    version: 1,
    title: "Provisional diagnosis",
    owner: FormOwner.DOCTOR,
    description:
      "The doctor's assessment. Ticking a condition records it; the note beside it is free text.",
    sections: [
      {
        title: "Conditions",
        description:
          "The printed sheet has three unlabelled columns beside each condition. Until somebody says what they were for, each condition has one note — say the word and they become three named columns.",
        fields: [
          { key: "dx_cervical_spondylosis", label: "1. Cervical spondylosis", type: "boolean" },
          { key: "dx_lumbar_spondylosis", label: "2. Lumbar spondylosis", type: "boolean" },
          { key: "dx_slipped_disc", label: "3. Slipped disc", type: "boolean" },
          { key: "dx_osteoarthritis_knee", label: "4. Osteo-arthritis (knee joint)", type: "boolean" },
          { key: "dx_calcaneal_spur", label: "5. Calcaneal spur", type: "boolean" },
          { key: "dx_varicose_vein", label: "6. Varicose vein", type: "boolean" },
          { key: "dx_migraine_sinusitis", label: "7. Migraine / sinusitis", type: "boolean" },
          { key: "dx_sleeplessness", label: "8. Sleeplessness", type: "boolean" },
          { key: "dx_incontinence", label: "9. Incontinence", type: "boolean" },
          { key: "dx_constipation", label: "10. Constipation", type: "boolean" },
          { key: "dx_acidity_gas", label: "11. Acidity / gas", type: "boolean" },
          { key: "dx_vertigo", label: "12. Vertigo", type: "boolean" },
          { key: "dx_depression", label: "13. Depression", type: "boolean" },
          { key: "dx_ankylosing_spondylitis", label: "14. Ankylosing spondylitis", type: "boolean" },
          { key: "dx_rheumatoid_arthritis", label: "15. Rheumatoid arthritis", type: "boolean" },
          { key: "dx_polyarthritis", label: "16. Poly-arthritis", type: "boolean" },
        ],
      },
      {
        title: "Other conditions",
        description: "Rows 17 to 20 on the printed sheet, left blank for anything not listed.",
        fields: [
          { key: "dx_other_17", label: "17.", type: "text", wide: true },
          { key: "dx_other_18", label: "18.", type: "text", wide: true },
          { key: "dx_other_19", label: "19.", type: "text", wide: true },
          { key: "dx_other_20", label: "20.", type: "text", wide: true },
        ],
      },
      {
        title: "Notes",
        fields: [
          { key: "dx_notes", label: "Diagnosis notes", type: "textarea", wide: true },
        ],
      },
    ],
  },

  // ══ Nutrition consultation — the nutritionist ════════════════════════════
  //
  // Transcribed from the clinic's own sheet, row by row, in the order it is
  // printed. It is filled in conversation — the nutritionist asks and types —
  // so nearly nothing is required: a patient who will not answer how much they
  // sleep must not block the consultation from being recorded.
  //
  // Two deliberate departures from the paper, both noted at the field:
  // several rows on the supplied sheet were blank, and they are left out
  // rather than guessed at; and the qualifiers the sheet writes inline
  // ("non veg, EXCEPT ON Tuesday") get their own box, because a preference
  // that cannot be read without reading a sentence cannot be filtered on.
  {
    key: "nutrition_consult",
    version: 2,
    title: "Nutrition consultation",
    owner: FormOwner.NUTRITIONIST,
    description:
      "The nutritionist's own sheet, filled with the patient in front of you. Everything here is asked, not measured — the measurements are on FORM-III.",
    sections: [
      {
        title: "This consultation",
        fields: [
          {
            key: "chief_complaints",
            label: "Chief complaints",
            type: "text",
            required: true,
            wide: true,
            help: "In the patient's own words — what they came in for.",
          },
          // The printed row reads "Initial consult, VISIT". The third option is
          // the mid-course review the clinic runs about a week in, which is a
          // real visit kind here and would otherwise be filed as an initial.
          {
            key: "visit_type",
            label: "Visit",
            type: "select",
            options: ["Initial consult", "Follow-up", "Review consult"],
            required: true,
          },
          { key: "occupation", label: "Occupation", type: "text" },
          {
            key: "observation",
            label: "Observation",
            type: "textarea",
            wide: true,
            help: "What you notice on seeing them, before any of the questions below.",
          },
        ],
      },
      {
        title: "Weight and vitals",
        description:
          "Taken today. Height and weight themselves live on FORM-III — this sheet carries only what the nutritionist reads off it.",
        fields: [
          {
            key: "lightest_adult_weight",
            label: "Lightest adult weight (last 5 years)",
            type: "number",
            unit: "kg",
            help: "What they have actually held as an adult — the honest floor for a target.",
          },
          {
            key: "bmi",
            label: "BMI",
            type: "number",
            help: "Copied from the measurements sheet, which computes it from height and weight.",
          },
          { key: "bp_systolic", label: "BP systolic", type: "number", unit: "mmHg" },
          { key: "bp_diastolic", label: "BP diastolic", type: "number", unit: "mmHg" },
          { key: "pulse_rate", label: "Pulse rate", type: "number", unit: "bpm" },
        ],
      },
      {
        title: "Daily habits",
        fields: [
          // Graded on the sheet by hand ("light constipation"), so graded here.
          {
            key: "constipation",
            label: "Constipation",
            type: "select",
            options: ["No", "Light", "Moderate", "Severe"],
          },
          { key: "bloating", label: "Bloating", type: "boolean" },
          {
            key: "exercise",
            label: "Exercise",
            type: "select",
            options: ["No", "Yes — regular", "Yes — irregular"],
          },
          { key: "water_intake", label: "Water intake", type: "number", unit: "litres a day" },
          { key: "sleep_hours", label: "Sleep", type: "number", unit: "hours a night" },
          {
            key: "meal_preference",
            label: "Meal preference",
            type: "select",
            options: ["Vegetarian", "Non-vegetarian", "Eggetarian", "Vegan", "Jain"],
            required: true,
          },
          // The sheet writes the exception inline. Kept apart so "who is
          // vegetarian" stays answerable without reading every sentence.
          {
            key: "meal_preference_notes",
            label: "Exceptions to that",
            type: "text",
            wide: true,
            help: "Fast days, days of the week, anything they will not eat.",
          },
        ],
      },
      {
        title: "History",
        fields: [
          {
            key: "family_medical_history",
            label: "Family medical history",
            type: "textarea",
            wide: true,
            help: "Who, and with what. Note it even when it skipped a generation.",
          },
          { key: "surgical_history", label: "Surgical history", type: "textarea", wide: true },
          {
            key: "social_history",
            label: "Social history",
            type: "text",
            wide: true,
            help: "Marital status, who they live with, who cooks.",
          },
          {
            key: "stress_incontinence",
            label: "Stress incontinence",
            type: "text",
            help: "And what brings it on, if they say.",
          },
          { key: "bladder_irritation", label: "Bladder irritation", type: "text" },
          { key: "food_allergies", label: "Food allergies", type: "textarea", wide: true },
        ],
      },
      {
        title: "Mouth and kitchen",
        description: "Both change what a plan can ask for — what they can chew, and what is cooked in.",
        fields: [
          {
            key: "last_dental_checkup",
            label: "Last dental check-up",
            type: "text",
            help: "A date, or how long ago they say it was.",
          },
          { key: "caries_count", label: "Caries in mouth", type: "number" },
          { key: "cooking_salt", label: "Salt used for cooking", type: "text" },
          { key: "cooking_oil", label: "Oil used for cooking", type: "text" },
        ],
      },
      {
        title: "Food recall",
        printedAs: "FOOD RECALL",
        description: "What they actually ate. Add only the meals they had.",
        fields: [
          {
            key: "meals",
            label: "Meals",
            type: "recall",
            wide: true,
            options: ["Breakfast", "Mid-morning", "Lunch", "Evening snack", "Dinner", "Post dinner"],
          },
        ],
      },
      {
        title: "Eating behaviour",
        fields: [
          { key: "stress_eating", label: "Stress eating", type: "boolean" },
          { key: "binge_eating", label: "Binge eating", type: "boolean" },
          { key: "cravings", label: "Cravings", type: "text", wide: true },
          {
            key: "outside_eating",
            label: "Outside eating",
            type: "text",
            help: "How often, not where.",
          },
        ],
      },
      {
        title: "Notes",
        description:
          "The doctor's instructions as the nutritionist took them down, and her own. Both are on the paper and both are kept: what was said in the room is not always what the prescription records.",
        fields: [
          { key: "doctor_note", label: "Doctor's note", type: "textarea", wide: true },
          { key: "nutritionist_note", label: "Nutritionist's note", type: "textarea", wide: true },
        ],
      },
    ],
  },
];

export function formByKey(key: string): FormDefinition | undefined {
  return CLINICAL_FORMS.find((f) => f.key === key);
}

export function formsForOwner(owner: FormOwner): FormDefinition[] {
  return CLINICAL_FORMS.filter((f) => f.owner === owner);
}

/** The form the front desk fills before taking the consultation fee. */
export const FRONT_DESK_FORM_KEY = "registration_front_desk";

/**
 * The forms a doctor completes before prescribing, in the order they are done.
 *
 * The workflow treats "the doctor is done" as every one of these being
 * submitted — but only the ones that actually have questions, so a form nobody
 * has written yet cannot hold every patient at the doctor for ever.
 */
export const DOCTOR_FORM_KEYS = [
  "registration_clinical",
  "questionnaire",
  "measurements",
  "provisional_diagnosis",
];

export const NUTRITION_FORM_KEY = "nutrition_consult";

/** Of a set of keys, the ones whose questions have been written. */
export function readyFormKeys(keys: string[]): string[] {
  return keys.filter((key) => {
    const form = formByKey(key);
    return form ? isFormReady(form) : false;
  });
}

/**
 * Whether a submission has everything the form marks required.
 *
 * Checked on submit, not on save: a half-filled form is kept so an interrupted
 * receptionist does not lose it, and only submitting advances the workflow.
 */
export function missingRequired(
  form: FormDefinition,
  answers: Record<string, unknown>,
): FormField[] {
  return formFields(form).filter((f) => {
    if (!f.required || f.type === FieldType.COMPUTED) return false;
    // A question that is not being asked cannot be missing an answer.
    if (!isFieldVisible(f, answers, formFields(form))) return false;
    const v = answers[f.key];
    if (v === undefined || v === null || v === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
}
