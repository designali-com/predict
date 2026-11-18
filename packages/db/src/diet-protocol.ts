/**
 * The nutritionist's dietary protocol for one patient — the printable plan
 * they hand over after the nutrition consult: a 7-day meal schedule, what to
 * cut out, the low-GI vegetables and fruits, portion sizes, a grocery list
 * with links, and the doctor's constraints.
 *
 * Written by a person, not by the rules (that is ./diet-plan.ts). It is the
 * patient's, not a visit's: one protocol, corrected over time, stored like the
 * rules plan as a clinical_form_submission with no appointment (see
 * ./diet-protocol-store.ts). Pure data and helpers — safe in the browser.
 */

export const PROTOCOL_DAYS = 7;

/** Which kitchen a protocol is written for. */
export type ProtocolDiet = "veg" | "egg" | "nonveg";

export const PROTOCOL_DIETS: { value: ProtocolDiet; label: string }[] = [
  { value: "veg", label: "Veg" },
  { value: "egg", label: "Eggetarian" },
  { value: "nonveg", label: "Non-veg" },
];

export const dietLabel = (diet: string | null | undefined) =>
  PROTOCOL_DIETS.find((d) => d.value === diet)?.label ?? null;

export interface ProtocolMeal {
  /** The row's name and time, e.g. "Breakfast - 9 am". */
  label: string;
  /** One entry per day, Day 1 first. Always PROTOCOL_DAYS long. */
  days: string[];
}

export interface ProtocolPortion {
  measure: string;
  value: string;
}

export interface ProtocolLink {
  name: string;
  url: string;
  store: string;
}

export interface DietProtocol {
  version: 1;
  /** Veg / egg / non-veg — which kitchen the meals are written for. */
  diet: ProtocolDiet | null;
  /** The library protocol this one was copied from, if any. */
  source?: { templateId: string; templateName: string };
  /** "Weight Loss Diet Plan" */
  title: string;
  /** The line under the title, e.g. "Clinical Nutrition Protocol for Healthy Weight Loss". */
  badge: string;
  /** "Ghee, Mustard oil, or Olive oil" — shown as "Strictly …". */
  cookingOils: string;
  /** The short excluded line on the summary card. */
  excludedSummary: string;
  /** A closing line on the summary card. */
  note: string;
  meals: ProtocolMeal[];
  remarks: string[];
  avoid: string[];
  vegetables: string[];
  fruits: string[];
  portions: ProtocolPortion[];
  grocery: string[];
  links: ProtocolLink[];
  physicianConstraints: string;
  /** Who last saved it — stamped by the server. */
  updated?: { byName: string; at: string };
}

const emptyDays = () => Array.from({ length: PROTOCOL_DAYS }, () => "");
const same = (text: string) => Array.from({ length: PROTOCOL_DAYS }, () => text);

/** The meal rows a new protocol starts with. */
export const DEFAULT_MEAL_ROWS = [
  "Protein shake with every breakfast meal",
  "Breakfast - 9 am",
  "Mid morning at 11 am",
  "Lunch at 1pm",
  "Snack before 4pm",
  "Dinner at 7.30pm",
];

export function emptyProtocol(): DietProtocol {
  return {
    version: 1,
    diet: null,
    title: "",
    badge: "",
    cookingOils: "",
    excludedSummary: "",
    note: "",
    meals: DEFAULT_MEAL_ROWS.map((label) => ({ label, days: emptyDays() })),
    remarks: [],
    avoid: [],
    vegetables: [],
    fruits: [],
    portions: [],
    grocery: [],
    links: [],
    physicianConstraints: "",
  };
}

/**
 * The clinic's weight-loss protocol, as written by its nutritionist — a
 * starting point to adjust for each patient, not a plan to hand out as is.
 */
export function weightLossTemplate(diet: ProtocolDiet = "egg"): DietProtocol {
  const redPoha = "Red poha — 3 tbsp raw red rice flakes, chopped veggies and a tadka of curry leaves";
  const cheela = "1 moong dal / besan / ragi cheela stuffed with chopped veggies + mint chutney";
  const oatsUpma = "Oats upma — 3 tbsp raw rolled oats, chopped veggies and a tadka of curry leaves";
  const missi = "2 paneer stuffed missi roti (120 g paneer) + 1 bowl palak raita";
  const sattu = "1 glass namkeen sattu drink";
  const makhana = "Handful of dry roasted makhana";
  const cucumber = "1 sliced cucumber";
  const berries = "Handful of fresh/frozen berries";
  const eggOr = (withEgg: string, veg: string) => (diet === "veg" ? veg : withEgg);
  return {
    version: 1,
    diet,
    title: "Weight Loss Diet Plan",
    badge: "Clinical Nutrition Protocol for Healthy Weight Loss",
    cookingOils: "Ghee, Mustard oil, or Olive oil",
    excludedSummary: "Sugar, milk, potatoes, maida, processed foods, fried items",
    note: "7-day meal schedule and portion guide in the printable plan.",
    meals: [
      { label: "Protein shake with every breakfast meal", days: same("1/2 scoop in a glass of water daily with breakfast") },
      {
        label: "Breakfast - 9 am",
        days: [
          redPoha,
          cheela,
          oatsUpma,
          cheela,
          "Sprouts salad — 1/2 cup boiled green moong sprouts, chopped veggies, spices of choice, 1 tsp olive oil",
          redPoha,
          oatsUpma,
        ],
      },
      {
        label: "Mid morning at 11 am",
        days: [
          "1 apple with a tsp of unsweetened almond butter",
          cucumber,
          berries,
          cucumber,
          berries,
          cucumber,
          "1 kiwi with a tsp of unsweetened almond butter",
        ],
      },
      {
        label: "Lunch at 1pm",
        days: [
          missi,
          "1/2 cup boiled brown rice + 1 cup kadhi + salad",
          "2 khapli roti + 1 cup cooked zucchini veg + 1 cup salad",
          missi,
          "Vegetable brown rice khichdi (4 tbsp raw brown rice sautéed with chopped veggies, spices of choice) + 1 cup mint raita",
          "2 jowar cheela stuffed with onion + 120 g paneer bhurji + salad",
          "2 khapli roti + 1 cup cooked lauki sabzi + 1 cup salad",
        ],
      },
      { label: "Snack before 4pm", days: [sattu, makhana, sattu, makhana, makhana, sattu, makhana] },
      {
        label: "Dinner at 7.30pm",
        days: [
          "Soya chunks curry and brown rice — 30 g raw brown rice + 40 g raw soya chunks + 1 cup tinda sabzi",
          eggOr("Egg bhurji (1 full, 1 egg white) + 2 khapli roti + 1 cup lauki sabzi", "Paneer bhurji (100 g) + 2 khapli roti + 1 cup lauki sabzi"),
          "3–4 medium kala chana cutlets stuffed with veggies + mint chutney",
          "2 khapli roti + 1 cup cooked bhindi veg + 1 cup salad",
          "4 medium mushroom galouti kababs with homemade chutney",
          "Veg soya pulao (4 tbsp red rice sautéed with chopped veggies, 40 g raw soyabean, spices of choice)",
          eggOr("Egg bhurji (1 full, 1 egg white) + 2 khapli roti + 1 cup parwal sabzi", "Tofu bhurji (100 g) + 2 khapli roti + 1 cup parwal sabzi"),
        ],
      },
    ],
    remarks: ["Stay hydrated & stay active", "All cooking to be done in ghee / olive oil / mustard oil", "Maintain hydration"],
    avoid: [
      "Fried, junk",
      "Packaged food",
      "Ready to eat stuff",
      "Sugar",
      "Milk",
      "Potato",
      "Cooked carrot, peas",
      "Sugary drinks",
      "Watermelon, banana, chikoo, melon, mango, grapes",
      "Sunflower seeds",
      "Dried fruit",
      "Processed food, anjeer, munakka, rice, poha",
      "Junk food, aerated drinks, alcohol",
      "Bread, pasta, maida",
    ],
    vegetables: [
      "Ridge gourd (tori)",
      "Ghia (bottle gourd)",
      "Green beans",
      "Bitter gourd",
      "Asparagus, lettuce",
      "Celery",
      "Onions",
      "Tomato",
      "Jackfruit",
      "Methi",
      "Palak (spinach)",
      "Beetroot (half, in salad)",
      "Ladyfinger (bhindi)",
      "Mushroom",
      "Radish",
      "Sweet potato",
    ],
    fruits: [
      "Papaya (1 katori)",
      "Pineapple (1 katori)",
      "Guava (1)",
      "Kiwi (1)",
      "Orange (1)",
      "Plum (1)",
      "Apricot (1)",
      "Grapefruit (1)",
      "Cherries (handful)",
      "Apple (1)",
      "Avocado (half)",
      "Strawberry (handful)",
      "Pomegranate (half)",
    ],
    portions: [
      { measure: "1 tablespoon", value: "12 g" },
      { measure: "4 tablespoons", value: "48 g" },
      { measure: "1 cup curd", value: "200 g" },
      { measure: "1 cup lentil", value: "200 g" },
      { measure: "1 cup milk", value: "250 ml" },
      { measure: "1 teaspoon", value: "5 g" },
    ],
    grocery: ["Khapli flour", "Red rice flakes", "Unsweetened almond butter", "Truebasics protein powder"],
    links: [
      { name: "Khapli flour", url: "https://blinkit.com/prn/two-brothers-khapli-wheat-atta-stoneground/prid/526292", store: "Blinkit" },
      { name: "Red rice flakes", url: "https://blinkit.com/prn/24-mantra-organic-red-poha/prid/3592", store: "Blinkit" },
      {
        name: "Unsweetened almond butter",
        url: "https://blinkit.com/prn/jusamazin-creamy-unsweetened-almond-butter/prid/613578",
        store: "Blinkit",
      },
      {
        name: "Truebasics protein powder",
        url: "https://blinkit.com/prn/truebasics-clean-whey-protein-isolate-powder-sachets-chocolate/prid/742201",
        store: "Blinkit",
      },
    ],
    physicianConstraints: "No specific restrictions mentioned by doctor.",
  };
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? v.map((x) => text(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

/**
 * Whatever came over the wire, as a protocol the store will keep: strings
 * trimmed and capped, lists de-blanked, every meal row exactly seven days.
 * Throws only when there is nothing worth saving.
 */
export function normalizeProtocol(input: unknown): DietProtocol {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const meals = (Array.isArray(p.meals) ? p.meals : [])
    .map((row) => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const days = Array.isArray(r.days) ? r.days.map((d) => text(d, 400)) : [];
      return {
        label: text(r.label, 80),
        days: Array.from({ length: PROTOCOL_DAYS }, (_, i) => days[i] ?? ""),
      };
    })
    .filter((row) => row.label || row.days.some(Boolean))
    .slice(0, 15);

  const diet = PROTOCOL_DIETS.some((d) => d.value === p.diet) ? (p.diet as ProtocolDiet) : null;
  const src = (p.source && typeof p.source === "object" ? p.source : null) as Record<string, unknown> | null;
  const protocol: DietProtocol = {
    version: 1,
    diet,
    ...(src && text(src.templateId, 80)
      ? { source: { templateId: text(src.templateId, 80), templateName: text(src.templateName, 120) } }
      : {}),
    title: text(p.title, 120),
    badge: text(p.badge, 160),
    cookingOils: text(p.cookingOils, 200),
    excludedSummary: text(p.excludedSummary, 300),
    note: text(p.note, 300),
    meals,
    remarks: list(p.remarks, 10, 200),
    avoid: list(p.avoid, 40, 150),
    vegetables: list(p.vegetables, 40, 100),
    fruits: list(p.fruits, 40, 100),
    portions: (Array.isArray(p.portions) ? p.portions : [])
      .map((row) => {
        const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return { measure: text(r.measure, 80), value: text(r.value, 40) };
      })
      .filter((r) => r.measure)
      .slice(0, 30),
    grocery: list(p.grocery, 40, 120),
    links: (Array.isArray(p.links) ? p.links : [])
      .map((row) => {
        const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        const url = text(r.url, 500);
        return { name: text(r.name, 120), url: /^https?:\/\//i.test(url) ? url : "", store: text(r.store, 40) };
      })
      .filter((r) => r.name && r.url)
      .slice(0, 30),
    physicianConstraints: text(p.physicianConstraints, 1000),
  };

  if (!protocol.title) throw new Error("Give the protocol a title.");
  return protocol;
}
