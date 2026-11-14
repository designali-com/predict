/**
 * The questionnaire a patient fills before their personalised plan is made.
 *
 * Eight short steps, filled by the patient themselves on their dashboard —
 * not at a counter by staff, which is what CLINICAL_FORMS are for. Kept out of
 * that list on purpose: those forms are signed, tied to a visit and move the
 * visit workflow along, and none of that applies to something a patient does
 * at home on their phone. It is stored in the same table
 * (clinical_form_submission, form key PATIENT_INTAKE_FORM_KEY, no appointment),
 * so it lives on the patient's record beside everything else.
 *
 * Nothing in this file touches the database — the patient app imports it
 * into the browser to draw the steps. Storage is in patient-intake-store.ts.
 */

export const PATIENT_INTAKE_FORM_KEY = "patient_intake";
/**
 * Bumped when questions change, and stamped onto every submission.
 *
 * 2: water and sleep became exact numbers on a slider instead of ranges
 * ("8", not "7-9"), so a version-1 answer and a version-2 answer to the same
 * question are not the same kind of value.
 */
export const PATIENT_INTAKE_VERSION = 2;

/**
 * How soon a patient is told their plan will be ready.
 *
 * One number, used in the questionnaire's closing screen and the task raised
 * for the nutritionist, so the promise and the deadline cannot drift apart.
 */
export const PLAN_TURNAROUND_HOURS = 48;

export type IntakeAnswers = Record<string, string | string[]>;

interface Base {
  key: string;
  label: string;
  /**
   * Only ask once another answer makes it relevant. `equals`: shown when that
   * answer is one of these. `notOnly`: shown when a multi-choice answer has
   * anything other than these (allergy details, once an allergy is ticked).
   */
  showWhen?: { field: string; equals?: string[]; notOnly?: string[] };
}

/**
 * A marker from the patient's own blood report, and the reading that makes a
 * note worth showing. Matched on the catalogue short code, case-insensitively.
 */
export interface IntakeMarkerRule {
  markers: string[];
  status: "High" | "Low";
}

export type IntakeField =
  | (Base & { kind: "number"; unit: string; placeholder: string; min: number; max: number; required?: boolean })
  /**
   * A whole number on a slider, with a drawing that follows it. The top of
   * the range means "this or more" — `maxLabel` says so ("15+").
   * Untouched, it shows `start` greyed and stores nothing: a slider
   * always has a position, and a position nobody chose is not an answer.
   */
  | (Base & {
      kind: "slider";
      unit: string;
      min: number;
      max: number;
      maxLabel: string;
      start: number;
      art: "glass" | "sleep";
    })
  /**
   * Not a question — a note tying this step to the patient's blood report.
   * Shown only when `when` matches their actual result, so it can never tell
   * somebody a marker is high when it is not. `highlight` is the phrase set
   * in colour; `text` follows it.
   */
  | (Base & { kind: "insight"; when: IntakeMarkerRule; highlight: string; text: string })
  | (Base & { kind: "text" | "textarea"; placeholder: string })
  /** A block with its own heading and a free-text box — the three meals. */
  | (Base & { kind: "meal"; hint: string; placeholder: string })
  | (Base & {
      kind: "single" | "multi";
      options: string[];
      /** Picking this clears the rest, and picking any other clears it. */
      exclusive?: string;
      /** Square buttons in a four-column grid, for short numeric ranges. */
      grid?: boolean;
      required?: boolean;
    });

export interface IntakeStep {
  key: string;
  /** The step's name in the header, beside the progress ring — "Digestion". */
  short: string;
  title: string;
  subtitle: string;
  /** Offer "Skip this step". The basics and the two medical steps are not skippable. */
  skippable: boolean;
  fields: IntakeField[];
}

export const INTAKE_STEPS: IntakeStep[] = [
  {
    key: "basics",
    short: "The basics",
    title: "First, the basics",
    subtitle: "So it's tailor-made for you",
    skippable: false,
    fields: [
      { key: "weight_kg", label: "Current weight", kind: "number", unit: "kg", placeholder: "68", min: 20, max: 300, required: true },
      { key: "height_cm", label: "Height", kind: "number", unit: "cm", placeholder: "172", min: 80, max: 250, required: true },
      { key: "age_years", label: "Age", kind: "number", unit: "years", placeholder: "47", min: 1, max: 120, required: true },
      { key: "sex", label: "Sex", kind: "single", options: ["Female", "Male", "Prefer not to say"], required: true },
    ],
  },
  {
    key: "digestion",
    short: "Digestion",
    title: "How has your gut been?",
    subtitle: "This decides how much fibre your plan starts with, and how fast it builds up.",
    skippable: true,
    fields: [
      {
        key: "digestion_issues",
        label: "",
        kind: "multi",
        options: ["Constipation", "Incomplete evacuation", "Loose motions", "Bloating or gas", "Acidity or reflux", "None of these"],
        exclusive: "None of these",
      },
      {
        key: "insight_crp_gut",
        label: "",
        kind: "insight",
        when: { markers: ["hs-CRP", "CRP"], status: "High" },
        highlight: "CRP came back high",
        text: "Gut symptoms are one of the common reasons for that, so this is where the plan will start.",
      },
      {
        key: "digestion_frequency",
        label: "How often?",
        kind: "single",
        options: ["Most days", "A few times a week", "Now and then"],
        // How often a problem happens means nothing once they have said
        // there is no problem.
        showWhen: { field: "digestion_issues", notOnly: ["None of these"] },
      },
    ],
  },
  {
    key: "day",
    short: "Your day",
    title: "Your usual day",
    subtitle: "Rough numbers are fine.",
    skippable: true,
    fields: [
      { key: "exercise_days", label: "Exercise", kind: "single", options: ["None", "1 to 2 days", "3 to 4 days", "5+ days"] },
      { key: "exercise_kind", label: "What kind", kind: "text", placeholder: "Evening walk, 30 min" },
      {
        key: "water_glasses",
        label: "Glasses of water a day",
        kind: "slider",
        unit: "glasses",
        min: 1,
        max: 15,
        maxLabel: "15+",
        start: 8,
        art: "glass",
      },
      {
        key: "sleep_hours",
        label: "Hours of sleep a night",
        kind: "slider",
        unit: "hours",
        min: 3,
        max: 11,
        maxLabel: "11+",
        start: 7,
        art: "sleep",
      },
    ],
  },
  {
    key: "eating",
    short: "Your kitchen",
    title: "How you eat",
    subtitle: "What's in your kitchen matters as much as what's on your plate.",
    skippable: true,
    fields: [
      { key: "meal_preference", label: "Meal preference", kind: "single", options: ["Vegetarian", "Non-vegetarian", "Eggetarian"] },
      // Several allowed: most kitchens use more than one oil and salt.
      { key: "cooking_oil", label: "Cooking oil", kind: "multi", options: ["Mustard", "Sunflower", "Groundnut", "Ghee", "Olive", "Refined blend", "Other"] },
      { key: "cooking_salt", label: "Cooking salt", kind: "multi", options: ["Iodised", "Rock or sendha", "Black salt", "Low sodium", "Other"] },
    ],
  },
  {
    key: "food_day",
    short: "Your meals",
    title: "A normal day of food",
    subtitle: "What you actually eat, not what you mean to. Add rough timings.",
    skippable: true,
    fields: [
      { key: "meal_morning", label: "Morning", kind: "meal", hint: "Breakfast and anything before lunch", placeholder: "2 idli + chutney, 8:30am. Tea at 11." },
      { key: "meal_afternoon", label: "Afternoon", kind: "meal", hint: "Lunch and the evening snack", placeholder: "Roti, dal, sabzi, 2pm. Biscuits at 5." },
      { key: "meal_evening", label: "Evening", kind: "meal", hint: "Dinner and anything after", placeholder: "Rice and curry, 9pm. Milk before bed." },
    ],
  },
  {
    key: "medical",
    short: "Medical history",
    title: "Medical history",
    subtitle: "Existing conditions change what we can recommend.",
    skippable: true,
    fields: [
      {
        key: "conditions",
        label: "Diagnosed conditions",
        kind: "multi",
        options: ["Diabetes", "High BP", "Thyroid", "PCOS", "High cholesterol", "None"],
        exclusive: "None",
      },
      { key: "past_surgeries", label: "Past surgeries", kind: "text", placeholder: "Appendectomy, 2016" },
      { key: "family_history", label: "Illness that runs in the family", kind: "text", placeholder: "Father: diabetes" },
    ],
  },
  {
    key: "medicines",
    short: "Medicines",
    title: "Medicines and allergies",
    subtitle: "This is the part our nutritionist reads first, so please be complete.",
    skippable: false,
    fields: [
      { key: "medicines", label: "Current medicines and supplements", kind: "textarea", placeholder: "Telmisartan 40mg, once daily. Vitamin D weekly." },
      { key: "allergies", label: "Allergies", kind: "multi", options: ["Food", "Medicine", "Environmental", "None"], exclusive: "None" },
      {
        key: "allergy_details",
        label: "",
        kind: "textarea",
        placeholder: "What you react to, and how. Prawns, rash and swelling.",
        showWhen: { field: "allergies", notOnly: ["None"] },
      },
    ],
  },
  {
    key: "last",
    short: "Last things",
    title: "A few last things",
    subtitle: "Honest answers make the plan usable. Nobody sees this except your nutritionist.",
    skippable: false,
    fields: [
      { key: "smoking", label: "Smoking", kind: "single", options: ["No", "Occasionally", "Daily"] },
      { key: "alcohol", label: "Alcohol", kind: "single", options: ["No", "Occasionally", "Weekly", "Most days"] },
      { key: "meals_out_per_week", label: "Meals eaten out or ordered in, per week", kind: "single", options: ["0", "1-2", "3-5", "6+"], grid: true },
      {
        key: "menstrual_cycle",
        label: "Menstrual cycle",
        kind: "multi",
        // Regular/irregular and light/heavy are two different questions on
        // one row, so more than one can be true.
        options: ["Regular", "Irregular", "Light", "Heavy", "Menopause"],
        showWhen: { field: "sex", equals: ["Female"] },
      },
    ],
  },
];

export const INTAKE_STEP_COUNT = INTAKE_STEPS.length;

function asList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

/** Whether a field is being asked, given the answers so far. */
export function isIntakeFieldVisible(field: IntakeField, answers: IntakeAnswers): boolean {
  const rule = field.showWhen;
  if (!rule) return true;
  const given = asList(answers[rule.field]).filter((v) => v.trim() !== "");
  if (rule.equals) return given.some((v) => rule.equals!.includes(v));
  if (rule.notOnly) return given.some((v) => !rule.notOnly!.includes(v));
  return given.length > 0;
}

/**
 * Answers with anything no longer asked taken out.
 *
 * Someone who ticked an allergy, described it, then changed their answer to
 * None would otherwise hand the nutritionist a description of an allergy
 * they have just said they do not have.
 */
export function pruneIntakeAnswers(answers: IntakeAnswers): IntakeAnswers {
  const kept: IntakeAnswers = {};
  for (const step of INTAKE_STEPS) {
    for (const field of step.fields) {
      if (field.kind === "insight") continue;
      if (!(field.key in answers)) continue;
      if (!isIntakeFieldVisible(field, answers)) continue;
      const value = answers[field.key]!;
      if (field.kind === "slider") {
        // Whole numbers inside the slider's own range, or nothing — a value
        // posted straight to the API should not be able to claim 400 glasses.
        const n = Number(value);
        if (!Number.isInteger(n) || n < field.min || n > field.max) continue;
        kept[field.key] = String(n);
        continue;
      }
      kept[field.key] = value;
    }
  }
  return kept;
}

/**
 * The patient's out-of-range markers, keyed by lower-cased short code —
 * { "hs-crp": "High" } — for deciding which report notes to show.
 */
export type IntakeFlags = Record<string, "High" | "Low">;

/** Whether this note matches the patient's actual report. */
export function insightApplies(field: IntakeField, flags: IntakeFlags): boolean {
  if (field.kind !== "insight") return false;
  return field.when.markers.some((code) => flags[code.toLowerCase()] === field.when.status);
}

/**
 * What stops a step from continuing, or null.
 *
 * Only the basics are required — the design says so, and it is what the plan
 * cannot be made without. The message is the one on the design, so the
 * browser and the server say the same thing.
 */
export function intakeStepProblem(stepIndex: number, answers: IntakeAnswers): string | null {
  const step = INTAKE_STEPS[stepIndex];
  if (!step) return null;

  const required = step.fields.filter((f) => "required" in f && f.required);
  if (!required.length) return null;

  const empty = required.some((f) => asList(answers[f.key]).every((v) => v.trim() === ""));
  if (empty) return "Fill in weight, height, age and sex to continue.";

  for (const field of required) {
    if (field.kind !== "number") continue;
    const value = Number(answers[field.key]);
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      return `That ${field.label.toLowerCase().replace("current ", "")} does not look right — check the number.`;
    }
  }
  return null;
}

/** "Bloating or gas, Acidity or reflux" — an answer as a line of text. */
export function formatIntakeAnswer(field: IntakeField, value: string | string[] | undefined): string {
  if (field.kind === "insight") return "";
  const list = asList(value).filter((v) => v.trim() !== "");
  if (!list.length) return "";
  if (field.kind === "slider") {
    const n = Number(list[0]);
    return `${n >= field.max ? field.maxLabel : n} ${field.unit}`;
  }
  const text = list.join(", ");
  return field.kind === "number" ? `${text} ${field.unit}` : text;
}
