/**
 * Seeds the single ai_assistant_config row used by the Predict AI patient
 * assistant. Exactly one row is meant to exist — this script is idempotent:
 * re-running it does nothing if a row already exists.
 *
 * Usage:
 * pnpm --filter @workspace/db create:ai-config
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";

import { db } from "../src/client";
import { aiAssistantConfig } from "../src/schema";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set (expected in packages/db/.env)",
    );
  }

  const existing = await db.query.aiAssistantConfig.findFirst();

  if (existing) {
    console.log(`\nai_assistant_config row already exists (id: ${existing.id}) — nothing to do.\n`);
    return;
  }

  const [created] = await db
    .insert(aiAssistantConfig)
    .values({ id: randomUUID() })
    .returning();

  console.log(`\n✅ Seeded ai_assistant_config\n`);
  console.log(`   id:    ${created.id}`);
  console.log(`   model: ${created.model}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Failed to seed ai_assistant_config\n");
    console.error(error);
    process.exit(1);
  });
