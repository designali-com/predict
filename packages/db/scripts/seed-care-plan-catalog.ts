import "dotenv/config";
import { db } from "../src/client";
import { carePlanCatalogItem } from "../src/schema";

/**
 * Starting pick-list for the care plan — ten of each kind.
 *
 * These are defaults to edit, not a clinical recommendation: the clinic
 * maintains the real list in Setup, and every field here is changeable there.
 * They exist so the first assignment is a two-click job rather than a typing
 * exercise, and so the same supplement is not recorded three different ways.
 *
 * `slots` is the usual timing, pre-filled into an assignment and still
 * editable per patient — the same item is genuinely taken differently by
 * different people.
 *
 * Idempotent: the (type, name) unique index makes a re-run a no-op, so this is
 * safe to run again after adding rows to the lists below.
 */
const CATALOG: {
  type: string;
  name: string;
  instructions?: string;
  slots: string[];
}[] = [
  // ── Supplements ────────────────────────────────────────────────────────
  { type: "supplement", name: "Vitamin D3 5000 IU", instructions: "With a meal containing fat", slots: ["morning"] },
  { type: "supplement", name: "Omega-3 (EPA/DHA) 1000 mg", instructions: "With food", slots: ["morning", "evening"] },
  { type: "supplement", name: "Magnesium Glycinate 400 mg", instructions: "Before bed", slots: ["evening"] },
  { type: "supplement", name: "Vitamin B12 (Methylcobalamin) 1500 mcg", slots: ["morning"] },
  { type: "supplement", name: "Coenzyme Q10 200 mg", instructions: "With a meal", slots: ["morning"] },
  { type: "supplement", name: "Creatine Monohydrate 5 g", instructions: "Any time, with water", slots: ["morning"] },
  { type: "supplement", name: "Zinc Picolinate 30 mg", instructions: "Not on an empty stomach", slots: ["evening"] },
  { type: "supplement", name: "Probiotic (multi-strain) 20 billion CFU", instructions: "Before breakfast", slots: ["morning"] },
  { type: "supplement", name: "Curcumin with Piperine 500 mg", instructions: "With food", slots: ["morning", "evening"] },
  { type: "supplement", name: "Collagen Peptides 10 g", instructions: "Mixed into water or coffee", slots: ["morning"] },

  // ── Medication ─────────────────────────────────────────────────────────
  { type: "medication", name: "Metformin 500 mg", instructions: "After food", slots: ["morning", "evening"] },
  { type: "medication", name: "Atorvastatin 10 mg", instructions: "At night", slots: ["evening"] },
  { type: "medication", name: "Levothyroxine 50 mcg", instructions: "Empty stomach, 30 min before breakfast", slots: ["morning"] },
  { type: "medication", name: "Amlodipine 5 mg", slots: ["morning"] },
  { type: "medication", name: "Telmisartan 40 mg", slots: ["morning"] },
  { type: "medication", name: "Pantoprazole 40 mg", instructions: "Before breakfast", slots: ["morning"] },
  { type: "medication", name: "Paracetamol 650 mg", instructions: "As needed for pain, after food", slots: ["morning", "afternoon", "evening"] },
  { type: "medication", name: "Etoricoxib 60 mg", instructions: "After food", slots: ["morning"] },
  { type: "medication", name: "Calcium + Vitamin D3", instructions: "After a meal", slots: ["afternoon"] },
  { type: "medication", name: "Ferrous Ascorbate 100 mg", instructions: "Empty stomach, with vitamin C", slots: ["morning"] },

  // ── Exercise ───────────────────────────────────────────────────────────
  { type: "exercise", name: "Quadriceps isometrics × 15", instructions: "Hold 5 seconds each", slots: ["morning", "evening"] },
  { type: "exercise", name: "Straight leg raise × 12", instructions: "Both legs", slots: ["morning", "evening"] },
  { type: "exercise", name: "Seated knee extension × 15", slots: ["morning", "evening"] },
  { type: "exercise", name: "Heel slides × 15", slots: ["morning"] },
  { type: "exercise", name: "Glute bridge × 12", slots: ["evening"] },
  { type: "exercise", name: "Calf raises × 20", slots: ["morning"] },
  { type: "exercise", name: "Hamstring stretch 30 s", instructions: "Each side, no bouncing", slots: ["morning", "evening"] },
  { type: "exercise", name: "Wall sit 30 s", slots: ["evening"] },
  { type: "exercise", name: "Brisk walk 20 min", slots: ["morning"] },
  { type: "exercise", name: "Stationary cycling 15 min", instructions: "Low resistance", slots: ["afternoon"] },

  // ── Diet ───────────────────────────────────────────────────────────────
  { type: "diet", name: "2 litres of water", slots: ["morning", "afternoon", "evening"] },
  { type: "diet", name: "Protein with every meal", instructions: "Roughly a palm-sized portion", slots: ["morning", "afternoon", "evening"] },
  { type: "diet", name: "30 g fibre daily", slots: ["afternoon"] },
  { type: "diet", name: "No added sugar", slots: ["morning", "afternoon", "evening"] },
  { type: "diet", name: "Two servings of vegetables at lunch", slots: ["afternoon"] },
  { type: "diet", name: "12-hour overnight fast", instructions: "e.g. 8 pm to 8 am", slots: ["evening"] },
  { type: "diet", name: "Limit refined carbohydrates", slots: ["afternoon", "evening"] },
  { type: "diet", name: "Green tea × 2 cups", slots: ["morning", "afternoon"] },
  { type: "diet", name: "No food after 8 pm", slots: ["evening"] },
  { type: "diet", name: "Mediterranean-style dinner", instructions: "Vegetables, olive oil, lean protein", slots: ["evening"] },
];

async function seed() {
  let inserted = 0;

  for (const item of CATALOG) {
    const [row] = await db
      .insert(carePlanCatalogItem)
      .values({
        type: item.type,
        name: item.name,
        defaultInstructions: item.instructions ?? null,
        defaultSlots: item.slots,
      })
      // A re-run leaves whatever the clinic has since edited alone — this
      // seeds a starting point, it does not own the list afterwards.
      .onConflictDoNothing({
        target: [carePlanCatalogItem.type, carePlanCatalogItem.name],
      })
      .returning();
    if (row) inserted++;
  }

  console.log(`Care plan catalogue: ${inserted} added, ${CATALOG.length - inserted} already present.`);
  console.log("Edit the list in the console under Setup → Care Plan Library.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
