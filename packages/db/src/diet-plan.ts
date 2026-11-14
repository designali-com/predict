/**
 * The personalised plan — worked out from the patient's blood report and
 * their questionnaire, by rules a clinician can read and check.
 *
 * Three layers, in this order:
 *
 *   1. Clusters. The five recognisable patterns from the clinic's nutrition
 *      notes (section 4.3): two or more related markers out of range
 *      together. Only a cluster brings a supplement — a single high reading
 *      is not a pattern, and the notes are explicit about not manufacturing
 *      one.
 *   2. Single markers. One marker out of range still changes what is on the
 *      plate (TG high → fewer refined carbs), just not what is in the pill box.
 *      Vitamin D low is the one exception: it is a supplement on its own.
 *   3. The questionnaire. Veg or non-veg picks the foods and the omega-3
 *      source; allergies take foods out; gut symptoms slow the fibre; the
 *      medicines box can hold a supplement back behind a doctor's check.
 *
 * Nothing in here touches the database, so the rules can be shown and tested
 * on their own. Loading the inputs and saving the result is diet-plan-store.ts.
 */

import type { IntakeAnswers } from "./patient-intake";

export const PLAN_VERSION = 1;

export type MarkerStatus = "High" | "Low" | "Normal";
export type Diet = "veg" | "egg" | "nonveg";

export interface PlanInput {
  /** Latest reading of every measured marker, keyed by lower-case short code. */
  markers: Record<string, MarkerStatus>;
  /** The patient's domains, with the markers each is built from (lower-case codes). */
  domains: { code: string; name: string; markers: string[] }[];
  /** Their questionnaire answers — null when they have not filled it in. */
  answers: IntakeAnswers | null;
}

export interface PlanCluster {
  key: string;
  name: string;
  /** The readings that made it — "hs-CRP high", "CK-MM high". */
  evidence: string[];
  suggests: string;
  nutritionAngle: string;
}

export interface PlanFocus {
  key: string;
  title: string;
  text: string;
  /** Domain codes this is about, so the card can show a domain's own first. */
  domains: string[];
}

export interface PlanSupplement {
  name: string;
  reason: string;
  domains: string[];
  /** Shown beside it — "check with your doctor first, you take a blood thinner". */
  caution?: string;
}

export interface PersonalizedPlan {
  version: number;
  generatedAt: string;
  /** Null when they have not said — the meals are then vegetarian. */
  diet: Diet | null;
  clusters: PlanCluster[];
  focus: PlanFocus[];
  supplements: PlanSupplement[];
  meals: { breakfast: string[]; lunch: string[]; dinner: string[]; snacks: string[] };
  drink: string;
  avoid: string[];
  habits: string[];
  cautions: string[];
  basis: { markersMeasured: number; markersOut: number; questionnaire: boolean };
  /**
   * Set once a nutritionist has changed it in the clinic panel. From then on
   * the rules no longer overwrite it — see refreshPatientPlan.
   */
  edited?: { byUserId: string; byName: string; at: string };
  /**
   * The report or the answers changed after the nutritionist's edit, so the
   * rules would now say something different. Cleared by the next edit or by
   * regenerating.
   */
  outdated?: { at: string; reason: string };
}

// ── Reading the inputs ──────────────────────────────────────────────────────

const DISPLAY: Record<string, string> = {
  "hs-crp": "hs-CRP",
  crp: "CRP",
  "il-6": "IL-6",
  nlr: "NLR",
  "ck-mm": "CK-MM",
  "aldolase a": "Aldolase A",
  pth: "PTH",
  "vitamin d": "Vitamin D",
  "ca/p ratio": "Ca/P ratio",
  hba1c: "HbA1c",
  tg: "TG",
  "substance p": "Substance P",
  gfap: "GFAP",
  "ctx-ii": "CTX-II",
  comp: "COMP",
};

function show(code: string) {
  return DISPLAY[code] ?? code.toUpperCase();
}

function list(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.filter((v) => v.trim() !== "");
  return value && value.trim() !== "" ? [value] : [];
}

class Reader {
  constructor(private input: PlanInput) {}

  is(code: string, status: MarkerStatus) {
    return this.input.markers[code] === status;
  }
  /** The codes among these that read `status`. */
  which(codes: string[], status: MarkerStatus) {
    return codes.filter((c) => this.is(c, status));
  }
  out(code: string) {
    return this.is(code, "High") || this.is(code, "Low");
  }
  /** Domain codes holding any of these markers. */
  domainsOf(codes: string[]) {
    return this.input.domains.filter((d) => d.markers.some((m) => codes.includes(m))).map((d) => d.code);
  }

  answer(key: string) {
    return list(this.input.answers?.[key]);
  }
  has(key: string, option: string) {
    return this.answer(key).includes(option);
  }
  text(key: string) {
    return this.answer(key).join(" ").toLowerCase();
  }
  number(key: string): number | null {
    const n = Number(this.answer(key)[0]);
    return Number.isFinite(n) && this.answer(key).length ? n : null;
  }
}

// ── The clusters ────────────────────────────────────────────────────────────

const INFLAMMATION = ["hs-crp", "crp", "il-6", "nlr"];
const SYSTEMIC_INFLAMMATION = ["hs-crp", "crp", "il-6"];

interface ClusterRule {
  key: string;
  name: string;
  /** Every group must have at least one marker reading as its status. */
  groups: { codes: string[]; status: MarkerStatus }[];
  /** Out of range too, it is named as supporting evidence; not required. */
  supporting?: string[];
  suggests: string;
  nutritionAngle: string;
  supplement: (r: Reader, diet: Diet | null, fishFree: boolean) => Omit<PlanSupplement, "domains">[];
  tags: Partial<Record<Tag, number>>;
}

function omega3(diet: Diet | null, fishFree: boolean, reason: string): Omit<PlanSupplement, "domains"> {
  const fish = diet === "nonveg" && !fishFree;
  return { name: fish ? "Omega-3 fish oil" : "Flaxseed oil", reason };
}

const CLUSTERS: ClusterRule[] = [
  {
    key: "inflammatory_muscle",
    name: "Inflammation with muscle stress",
    groups: [
      { codes: INFLAMMATION, status: "High" },
      { codes: ["ck-mm", "aldolase a"], status: "High" },
    ],
    suggests:
      "Muscle turnover is happening against a background of inflammation. Calming the inflammation comes first, because it holds back muscle repair.",
    nutritionAngle:
      "Anti-inflammatory foods (oily fish or flaxseed, olive or mustard oil, colourful produce) with protein spread across the day, not just more protein.",
    supplement: (_r, diet, fishFree) => [
      omega3(diet, fishFree, "Inflammation markers and muscle markers are high together."),
      { name: "Resveratrol", reason: "Supports the anti-inflammatory side of the muscle plan." },
    ],
    tags: { antiInflammatory: 3, omega3: 3, protein: 2, antioxidant: 1 },
  },
  {
    key: "bone_vitamin_d",
    name: "Bone and vitamin D",
    groups: [
      { codes: ["pth"], status: "High" },
      { codes: ["vitamin d"], status: "Low" },
    ],
    supporting: ["ca/p ratio"],
    suggests: "Low vitamin D is pushing parathyroid hormone up to hold calcium steady.",
    nutritionAngle: "Vitamin D-rich and fortified foods, enough calcium every day, and a vitamin D supplement.",
    supplement: () => [{ name: "Vitamin D3 60K (Uprise D3)", reason: "Vitamin D is low and PTH is high." }],
    tags: { calcium: 3, vitD: 3 },
  },
  {
    key: "cardiometabolic_inflammatory",
    name: "Blood sugar or fats with inflammation",
    groups: [
      { codes: ["hba1c", "tg"], status: "High" },
      { codes: SYSTEMIC_INFLAMMATION, status: "High" },
    ],
    suggests: "Metabolic control and inflammation are feeding each other, so one plan has to move both.",
    nutritionAngle:
      "One pattern: fibre-forward, whole food, less refined carbohydrate and ultra-processed food. Not a sugar plan and a separate inflammation plan.",
    supplement: (_r, diet, fishFree) => [omega3(diet, fishFree, "Blood sugar or triglycerides are high along with inflammation.")],
    tags: { lowGI: 3, highFibre: 2, antiInflammatory: 2, omega3: 2 },
  },
  {
    key: "neuro_pain",
    name: "Nerve and pain signalling",
    groups: [{ codes: ["substance p", "gfap"], status: "High" }],
    suggests:
      "Nerve signalling or nerve inflammation is adding to the pain. Nutrition supports the pain-management plan, it does not replace it.",
    nutritionAngle: "General anti-inflammatory, nerve-supportive eating alongside the doctor's pain plan.",
    supplement: () => [{ name: "Curcumin", reason: "Pain-signalling markers are high." }],
    tags: { antiInflammatory: 3, omega3: 2, antioxidant: 1 },
  },
  {
    key: "cartilage_structural",
    name: "Cartilage and joint wear",
    groups: [{ codes: ["ctx-ii", "comp"], status: "High" }],
    suggests: "Cartilage breakdown markers are raised, a structural joint picture rather than a lone lab value.",
    nutritionAngle: "Anti-inflammatory and collagen-supportive eating (vitamin C, enough protein), alongside physiotherapy.",
    supplement: () => [{ name: "MSM (methylsulfonylmethane)", reason: "Cartilage breakdown markers are high." }],
    tags: { vitC: 3, protein: 2, antiInflammatory: 2 },
  },
];

// ── The foods ───────────────────────────────────────────────────────────────

type Tag =
  | "lowGI"
  | "highFibre"
  | "solubleFibre"
  | "omega3"
  | "antiInflammatory"
  | "antioxidant"
  | "protein"
  | "calcium"
  | "vitD"
  | "vitC"
  | "nitrate"
  | "iron"
  | "lowSatFat"
  | "probiotic"
  | "gentle";

type Allergen = "fish" | "egg" | "dairy" | "nuts" | "peanut" | "gluten" | "soy";

interface Food {
  text: string;
  diet: Diet;
  tags: Tag[];
  allergens?: Allergen[];
  /** Beans and whole pulses: held back while the gut settles. */
  heavy?: boolean;
  /** Paneer, eggs and meat as the centre of the meal: not pushed on weak kidneys. */
  proteinHeavy?: boolean;
}

const BREAKFAST: Food[] = [
  { text: "Vegetable oats porridge with carrots, beans and peas + 1 apple", diet: "veg", tags: ["solubleFibre", "highFibre", "lowGI", "lowSatFat"] },
  { text: "Moong dal chilla with mint chutney + a bowl of papaya", diet: "veg", tags: ["protein", "lowGI", "vitC", "gentle"] },
  { text: "Vegetable poha with peanuts + cucumber slices", diet: "veg", tags: ["gentle", "iron"], allergens: ["peanut"] },
  { text: "2 idlis with sambar + coconut chutney", diet: "veg", tags: ["gentle", "probiotic", "protein"] },
  { text: "Ragi dosa + tomato chutney + a glass of buttermilk", diet: "veg", tags: ["calcium", "lowGI", "probiotic"], allergens: ["dairy"] },
  { text: "Besan chilla with spinach + curd", diet: "veg", tags: ["protein", "iron", "calcium", "lowGI"], allergens: ["dairy"] },
  { text: "Overnight oats with chia seeds, walnuts and berries", diet: "veg", tags: ["omega3", "solubleFibre", "antioxidant", "antiInflammatory"], allergens: ["nuts", "dairy"] },
  { text: "Daliya (broken wheat) upma with vegetables + an orange", diet: "veg", tags: ["highFibre", "lowGI", "vitC"], allergens: ["gluten"] },
  { text: "Sprouts salad with lemon, tomato and onion + 1 guava", diet: "veg", tags: ["protein", "vitC", "highFibre", "antioxidant"], heavy: true },
  { text: "Paneer bhurji + 1 multigrain roti", diet: "veg", tags: ["protein", "calcium"], allergens: ["dairy", "gluten"], proteinHeavy: true },
  { text: "Vegetable upma + a bowl of papaya", diet: "veg", tags: ["gentle", "vitC"], allergens: ["gluten"] },
  { text: "Ragi porridge with milk and a few almonds", diet: "veg", tags: ["calcium", "vitD", "gentle"], allergens: ["dairy", "nuts"] },
  { text: "2 boiled eggs + 1 multigrain toast + sautéed spinach", diet: "egg", tags: ["protein", "vitD", "iron"], allergens: ["egg", "gluten"], proteinHeavy: true },
  { text: "Vegetable omelette (2 eggs) + 1 fruit", diet: "egg", tags: ["protein", "vitD", "vitC"], allergens: ["egg"], proteinHeavy: true },
  { text: "Egg bhurji with onions and tomatoes + 1 multigrain roti", diet: "egg", tags: ["protein", "vitD"], allergens: ["egg", "gluten"], proteinHeavy: true },
  { text: "Grilled fish tikka + vegetable salad", diet: "nonveg", tags: ["omega3", "protein", "vitD", "antiInflammatory"], allergens: ["fish"], proteinHeavy: true },
];

const LUNCH: Food[] = [
  { text: "Dal with brown rice + mixed vegetable salad", diet: "veg", tags: ["highFibre", "lowGI", "protein"] },
  { text: "2 multigrain rotis + dal + seasonal sabzi", diet: "veg", tags: ["highFibre", "lowGI", "protein"], allergens: ["gluten"] },
  { text: "Millet (jowar or bajra) roti + palak dal + salad", diet: "veg", tags: ["lowGI", "iron", "highFibre", "calcium"] },
  { text: "Rajma or chole with a small bowl of brown rice + salad", diet: "veg", tags: ["protein", "highFibre", "solubleFibre", "lowGI"], heavy: true },
  { text: "Quinoa vegetable pulao + curd", diet: "veg", tags: ["protein", "probiotic", "lowGI"], allergens: ["dairy"] },
  { text: "Grilled paneer + sautéed vegetables + 1 roti", diet: "veg", tags: ["protein", "calcium"], allergens: ["dairy", "gluten"], proteinHeavy: true },
  { text: "Lauki or tori sabzi + moong dal + 2 phulkas", diet: "veg", tags: ["gentle", "lowSatFat"], allergens: ["gluten"] },
  { text: "Curd rice with a vegetable raita + cucumber", diet: "veg", tags: ["gentle", "probiotic", "calcium"], allergens: ["dairy"] },
  { text: "Beetroot and carrot salad + dal + 2 rotis", diet: "veg", tags: ["nitrate", "antioxidant", "highFibre"], allergens: ["gluten"] },
  { text: "Soya chunks curry + brown rice + salad", diet: "veg", tags: ["protein", "lowSatFat"], allergens: ["soy"], proteinHeavy: true },
  { text: "Egg curry (2 eggs) + 1 roti + salad", diet: "egg", tags: ["protein", "vitD"], allergens: ["egg", "gluten"], proteinHeavy: true },
  { text: "Fish curry (rohu, mackerel or sardine) + brown rice + salad", diet: "nonveg", tags: ["omega3", "protein", "vitD", "antiInflammatory"], allergens: ["fish"], proteinHeavy: true },
  { text: "Grilled chicken + sautéed vegetables + 1 roti", diet: "nonveg", tags: ["protein", "lowSatFat"], allergens: ["gluten"], proteinHeavy: true },
];

const DINNER: Food[] = [
  { text: "Moong dal khichdi + vegetable salad", diet: "veg", tags: ["gentle", "protein", "lowSatFat"] },
  { text: "Vegetable soup + 2 multigrain rotis", diet: "veg", tags: ["gentle", "highFibre", "antioxidant"], allergens: ["gluten"] },
  { text: "Dal + seasonal vegetables + small portion of brown rice", diet: "veg", tags: ["highFibre", "lowGI", "protein"] },
  { text: "Millet khichdi (foxtail or little millet) with vegetables", diet: "veg", tags: ["lowGI", "highFibre", "gentle"] },
  { text: "Palak paneer + 1 roti", diet: "veg", tags: ["calcium", "iron", "protein"], allergens: ["dairy", "gluten"], proteinHeavy: true },
  { text: "Stir-fried tofu with vegetables + 1 roti", diet: "veg", tags: ["protein", "calcium", "lowSatFat"], allergens: ["soy", "gluten"], proteinHeavy: true },
  { text: "Lauki chana dal + 2 phulkas", diet: "veg", tags: ["protein", "lowGI"], allergens: ["gluten"] },
  { text: "Vegetable daliya with curd", diet: "veg", tags: ["highFibre", "gentle", "probiotic"], allergens: ["gluten", "dairy"] },
  { text: "Mixed vegetable and bean soup + a slice of multigrain bread", diet: "veg", tags: ["highFibre", "solubleFibre", "antioxidant"], allergens: ["gluten"], heavy: true },
  { text: "Egg white bhurji + sautéed vegetables + 1 roti", diet: "egg", tags: ["protein", "lowSatFat"], allergens: ["egg", "gluten"], proteinHeavy: true },
  { text: "Steamed or grilled fish + stir-fried vegetables", diet: "nonveg", tags: ["omega3", "protein", "vitD", "antiInflammatory", "lowSatFat"], allergens: ["fish"], proteinHeavy: true },
  { text: "Chicken and vegetable clear soup + 1 roti", diet: "nonveg", tags: ["protein", "gentle", "lowSatFat"], allergens: ["gluten"], proteinHeavy: true },
];

const SNACKS: Food[] = [
  { text: "A handful of walnuts and almonds", diet: "veg", tags: ["omega3", "antioxidant", "lowGI"], allergens: ["nuts"] },
  { text: "Roasted chana", diet: "veg", tags: ["protein", "lowGI", "highFibre"] },
  { text: "1 fruit — guava, orange, apple or papaya", diet: "veg", tags: ["vitC", "antioxidant", "highFibre", "gentle"] },
  { text: "Buttermilk with roasted jeera", diet: "veg", tags: ["probiotic", "calcium", "gentle"], allergens: ["dairy"] },
  { text: "Roasted makhana", diet: "veg", tags: ["lowGI", "gentle", "calcium"] },
  { text: "1 tbsp roasted flaxseed and pumpkin seed mix", diet: "veg", tags: ["omega3", "antiInflammatory"] },
  { text: "Beetroot, carrot and amla juice (no sugar)", diet: "veg", tags: ["nitrate", "antioxidant", "vitC"] },
  { text: "Green tea instead of sugared tea", diet: "veg", tags: ["antioxidant", "antiInflammatory"] },
  { text: "Sprouts chaat", diet: "veg", tags: ["protein", "vitC", "highFibre"], heavy: true },
  { text: "1 boiled egg", diet: "egg", tags: ["protein", "vitD"], allergens: ["egg"], proteinHeavy: true },
];

const ALLERGEN_WORDS: Record<Allergen, RegExp> = {
  fish: /\b(fish|sea ?food|prawns?|shrimps?|crabs?|shell ?fish)\b/,
  egg: /\beggs?\b/,
  dairy: /\b(milk|dairy|lactose|paneer|curd|cheese)\b/,
  nuts: /\b(nuts?|almonds?|walnuts?|cashews?|tree ?nuts?)\b/,
  peanut: /\b(peanuts?|groundnuts?)\b/,
  gluten: /\b(gluten|wheat|celiac|coeliac)\b/,
  soy: /\b(soy|soya|tofu)\b/,
};

// ── Building the plan ───────────────────────────────────────────────────────

export function buildPersonalizedPlan(input: PlanInput, now = new Date()): PersonalizedPlan {
  const r = new Reader(input);
  const tags: Partial<Record<Tag, number>> = {};
  const bump = (more: Partial<Record<Tag, number>>) => {
    for (const [tag, w] of Object.entries(more) as [Tag, number][]) tags[tag] = (tags[tag] ?? 0) + w;
  };

  const focus: PlanFocus[] = [];
  const supplements: PlanSupplement[] = [];
  const avoid = new Set<string>();
  const habits: string[] = [];
  const cautions: string[] = [];

  // Questionnaire facts, read once.
  const pref = r.answer("meal_preference")[0];
  const diet: Diet | null = pref === "Non-vegetarian" ? "nonveg" : pref === "Eggetarian" ? "egg" : pref === "Vegetarian" ? "veg" : null;
  const allergyText = r.has("allergies", "Food") ? r.text("allergy_details") : "";
  const allergens = (Object.keys(ALLERGEN_WORDS) as Allergen[]).filter((a) => ALLERGEN_WORDS[a].test(allergyText));
  const fishFree = allergens.includes("fish");
  const medicines = r.text("medicines");
  const onBloodThinner = /\b(warfarin|acitrom|acenocoumarol|aspirin|ecosprin|clopidogrel|clopitab|apixaban|rivaroxaban|dabigatran|ticagrelor|prasugrel|blood thinner)\b/.test(medicines);
  const onVitaminD = /\b(vitamin ?d|d3|cholecalciferol|calcirol|uprise|60 ?k)\b/.test(medicines);
  const gutIssues = r.answer("digestion_issues").filter((o) => o !== "None of these");
  const conditions = r.answer("conditions");
  const kidneys = r.is("egfr", "Low") || r.is("creatinine", "High") || r.is("bun", "High");

  // 1. Clusters.
  const clusters: PlanCluster[] = [];
  for (const rule of CLUSTERS) {
    const hits = rule.groups.map((g) => r.which(g.codes, g.status));
    if (hits.some((h) => h.length === 0)) continue;
    const found = hits.flatMap((h, i) => h.map((c) => `${show(c)} ${rule.groups[i]!.status.toLowerCase()}`));
    for (const c of rule.supporting ?? []) if (r.out(c)) found.push(`${show(c)} out of range`);
    const codes = [...rule.groups.flatMap((g) => g.codes), ...(rule.supporting ?? [])];
    const domains = r.domainsOf(codes);

    clusters.push({ key: rule.key, name: rule.name, evidence: found, suggests: rule.suggests, nutritionAngle: rule.nutritionAngle });
    focus.push({ key: rule.key, title: rule.name, text: rule.nutritionAngle, domains });
    bump(rule.tags);
    for (const s of rule.supplement(r, diet, fishFree)) {
      if (!supplements.some((x) => x.name === s.name)) supplements.push({ ...s, domains });
    }
  }
  const inCluster = (key: string) => clusters.some((c) => c.key === key);

  // 2. Single markers — food, not supplements (bar vitamin D).
  const single = (key: string, codes: string[], title: string, text: string, more: Partial<Record<Tag, number>>, avoids: string[] = []) => {
    focus.push({ key, title, text, domains: r.domainsOf(codes) });
    bump(more);
    for (const a of avoids) avoid.add(a);
  };

  if (r.is("tg", "High")) {
    single("tg", ["tg"], "Bring triglycerides down", "Cut sugar, sweets, fruit juice, maida and alcohol, and eat more fibre and omega-3 foods. TG responds to this faster than most markers.", { lowGI: 2, highFibre: 2, omega3: 2 }, ["Sugar, sweets, fruit juice and sweetened drinks", "Maida: white bread, biscuits, bakery items"]);
  }
  if (r.is("ldl-c", "High") || r.is("tc", "High") || conditions.includes("High cholesterol")) {
    single("ldl", ["ldl-c", "tc"], "Lower LDL cholesterol", "Oats, barley, dal and vegetables for soluble fibre. Nuts in small portions. Less ghee, butter, cream and fried food.", { solubleFibre: 3, lowSatFat: 2, highFibre: 1 }, ["Fried snacks: samosa, pakora, namkeen", "Vanaspati, and repeatedly reheated oil"]);
  }
  if (r.is("hdl-c", "Low")) {
    single("hdl", ["hdl-c"], "Raise HDL", "Daily brisk activity, nuts and seeds, and mustard or olive oil in place of refined blends.", { omega3: 1, antioxidant: 1 });
  }
  if (r.is("hba1c", "High") || conditions.includes("Diabetes") || conditions.includes("PCOS")) {
    single("sugar", ["hba1c"], "Steady blood sugar", "Low-GI grains (millets, brown rice, multigrain), protein with every meal, and no sugar in tea.", { lowGI: 3, highFibre: 1, protein: 1 }, ["Sugar, sweets, fruit juice and sweetened drinks"]);
  }
  if (!inCluster("inflammatory_muscle") && !inCluster("cardiometabolic_inflammatory") && r.which(INFLAMMATION, "High").length) {
    const codes = r.which(INFLAMMATION, "High");
    single("inflammation", codes, "Calm inflammation", `${codes.map(show).join(" and ")} ${codes.length > 1 ? "are" : "is"} high. Colourful vegetables, fruit, turmeric and omega-3 foods, and less fried and processed food.`, { antiInflammatory: 3, antioxidant: 2, omega3: 2 }, ["Packaged and ultra-processed food"]);
  }
  if (r.is("mda", "High")) {
    single("oxidative", ["mda"], "Lower oxidative stress", "Amla, citrus, berries, green leafy vegetables and nuts every day.", { antioxidant: 3, vitC: 1 });
  }
  if (r.is("vitamin d", "Low") && !inCluster("bone_vitamin_d")) {
    single("vitd", ["vitamin d"], "Build up vitamin D", "15–20 minutes of morning sun on arms and legs, plus eggs, fish or fortified milk.", { vitD: 3, calcium: 2 });
    supplements.push({ name: "Vitamin D3 60K (Uprise D3)", reason: "Vitamin D is low.", domains: r.domainsOf(["vitamin d"]) });
  }
  if (r.out("ca/p ratio") && !inCluster("bone_vitamin_d")) {
    single("calcium", ["ca/p ratio"], "Balance calcium", "Enough calcium every day from curd, ragi, sesame and leafy greens, with fewer colas and processed meats (high in phosphate).", { calcium: 3 }, ["Cola drinks"]);
  }
  if (!inCluster("inflammatory_muscle") && (r.is("igf-1", "Low") || r.is("myostatin", "High") || r.is("ck-mm", "High"))) {
    single("muscle", ["igf-1", "myostatin", "ck-mm"], "Support muscle", "Protein at every meal rather than one big serving, alongside strength exercise.", { protein: 3 });
  }
  if (r.is("nox", "Low")) {
    single("nitric", ["nox"], "Support blood-vessel health", "Beetroot, spinach and other leafy greens for natural nitrates, and daily walking.", { nitrate: 3, antioxidant: 1 });
  }
  if (r.is("bdnf", "Low")) {
    single("brain", ["bdnf"], "Support brain and nerve health", "Regular aerobic exercise, good sleep, and omega-3 foods.", { omega3: 2 });
  }

  // Kidneys decide how hard protein can be pushed, whatever else asked for it.
  if (kidneys) {
    const codes = ["egfr", "creatinine", "bun"].filter((c) => r.out(c));
    focus.push({
      key: "kidney",
      title: "Go gently on protein and salt",
      text: `${codes.map((c) => (c === "egfr" ? "eGFR" : c === "bun" ? "BUN" : "Creatinine")).join(" and ")} ${codes.length > 1 ? "are" : "is"} out of range, so this plan does not push extra protein. No protein powder until your nutritionist sets the amount.`,
      domains: r.domainsOf(codes),
    });
    tags.protein = Math.min(tags.protein ?? 0, 0);
    avoid.add("Extra salt, pickles and papad");
    cautions.push("Kidney markers are out of range: protein and potassium to be set by the nutritionist.");
  }

  // 3. The questionnaire.
  if (gutIssues.length) {
    tags.gentle = (tags.gentle ?? 0) + 3;
    habits.push("Fibre builds up slowly over 2–3 weeks: start with cooked vegetables and dal, and add whole pulses and raw salads later.");
    if (gutIssues.includes("Acidity or reflux")) {
      avoid.add("Very spicy, fried and late-night meals");
      habits.push("Keep 2–3 hours between dinner and bed.");
    }
    if (gutIssues.includes("Constipation") || gutIssues.includes("Incomplete evacuation")) {
      habits.push("Soaked raisins or figs in the morning, and warm water on waking.");
    }
  }
  if (conditions.includes("High BP")) avoid.add("Extra salt, pickles and papad");
  const oils = r.answer("cooking_oil");
  if (oils.length && oils.every((o) => o === "Refined blend" || o === "Sunflower")) {
    habits.push("Switch between mustard, groundnut and olive oil instead of only refined oil.");
  }
  if (oils.includes("Ghee") && (r.is("ldl-c", "High") || r.is("tc", "High"))) {
    habits.push("Keep ghee to 1 teaspoon a day while LDL is high.");
  }

  const water = r.number("water_glasses");
  if (water !== null && water < 8) habits.push(`Drink more water: you have about ${water} glasses now, aim for 8–10 unless your doctor limits fluids.`);
  const sleep = r.number("sleep_hours");
  if (sleep !== null && sleep < 7) habits.push(`Sleep 7–8 hours: at ${sleep} hours, inflammation and blood sugar are harder to bring down.`);
  if (r.has("exercise_days", "None")) habits.push("Start with a 20–30 minute walk, 5 days a week.");
  const out = r.answer("meals_out_per_week")[0];
  if (out === "3-5" || out === "6+") habits.push("Cut meals out or ordered in to twice a week. When you do, pick grilled, tandoori or dal-based dishes.");
  if (r.has("smoking", "Daily") || r.has("smoking", "Occasionally")) habits.push("Stopping smoking will help every marker in this plan. Ask us about support.");
  if (r.has("alcohol", "Weekly") || r.has("alcohol", "Most days") || (r.is("tg", "High") && r.has("alcohol", "Occasionally"))) {
    avoid.add("Alcohol");
  }
  if (r.has("menstrual_cycle", "Heavy")) {
    bump({ iron: 2, vitC: 1 });
    habits.push("Heavy periods use up iron: leafy greens, dates and beetroot, with a vitamin C fruit alongside.");
  }
  const age = r.number("age_years");
  if (age !== null && age >= 60 && !kidneys) bump({ protein: 1, calcium: 1 });

  // Supplements the medicines box has to clear first.
  for (const s of supplements) {
    if (onBloodThinner && /omega|fish|flax|curcumin|resveratrol/i.test(s.name)) {
      s.caution = "You take a blood thinner — check with your doctor before starting this.";
    }
    if (onVitaminD && /vitamin d/i.test(s.name)) {
      s.caution = "You already take vitamin D — carry on with it and don't double up.";
    }
  }
  if (onBloodThinner) cautions.push("On a blood thinner: omega-3, curcumin and resveratrol need the doctor's go-ahead.");
  if (fishFree && diet === "nonveg") cautions.push("Fish allergy: omega-3 comes from flaxseed, not fish oil.");
  if (!input.answers) cautions.push("Questionnaire not filled yet, so meals are vegetarian and not yet fitted to allergies or medicines.");

  // Meals.
  const allowed = (f: Food) =>
    (f.diet === "veg" || (f.diet === "egg" && (diet === "egg" || diet === "nonveg")) || (f.diet === "nonveg" && diet === "nonveg")) &&
    !(f.allergens ?? []).some((a) => allergens.includes(a)) &&
    !(f.allergens?.includes("fish") && fishFree) &&
    !(f.heavy && gutIssues.length);

  const pick = (foods: Food[], n: number) => {
    const scored = foods
      .filter(allowed)
      .map((f, i) => ({ f, i, score: f.tags.reduce((s, t) => s + (tags[t] ?? 0), 0) + (f.proteinHeavy && kidneys ? -3 : 0) }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
    const chosen = scored.slice(0, n);
    // A non-vegetarian should see at least one of their own options, even when
    // the vegetarian ones happen to score higher.
    if (diet && diet !== "veg" && !chosen.some((c) => c.f.diet !== "veg")) {
      const theirs = scored.find((c) => c.f.diet !== "veg");
      if (theirs) chosen[chosen.length - 1] = theirs;
    }
    return chosen.map((c) => c.f.text);
  };

  const drink = kidneys
    ? "Water through the day. Check with your doctor before coconut water — it is high in potassium."
    : "Water through the day, or unsweetened coconut water now and then. Tea and coffee without sugar.";

  const markerValues = Object.values(input.markers);
  return {
    version: PLAN_VERSION,
    generatedAt: now.toISOString(),
    diet,
    clusters,
    focus,
    supplements,
    meals: { breakfast: pick(BREAKFAST, 5), lunch: pick(LUNCH, 4), dinner: pick(DINNER, 4), snacks: pick(SNACKS, 4) },
    drink,
    avoid: [...avoid],
    habits,
    cautions,
    basis: {
      markersMeasured: markerValues.length,
      markersOut: markerValues.filter((s) => s !== "Normal").length,
      questionnaire: input.answers !== null,
    },
  };
}
