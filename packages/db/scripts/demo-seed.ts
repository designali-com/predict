/**
 * Fill the demo database with its fictional world (wipes it first).
 * Refuses unless DEMO_MODE=1 — never point this at a real database.
 *
 *   pnpm --filter @workspace/db demo:seed
 */
import "dotenv/config";
import { db } from "../src/client";
import { seedDemo } from "../src/demo-seed";

async function main() {
  const t = Date.now();
  const counts = await seedDemo(db);
  console.log(`Demo seeded in ${((Date.now() - t) / 1000).toFixed(1)}s:`, counts);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
