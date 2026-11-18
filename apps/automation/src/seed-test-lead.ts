import "dotenv/config";
import { db } from "@workspace/db/client";
import { contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";

const TEST_LEADS = [
  { name: "Test Lead 1", phone: "9999900001" },
  { name: "Test Lead 2", phone: "9999900002" },
  { name: "Test Lead 3", phone: "9999900003" },
];

async function main() {
  for (const lead of TEST_LEADS) {
    const [existing] = await db.select().from(contact).where(eq(contact.phone, lead.phone)).limit(1);
    if (existing) {
      console.log(`${lead.name} already exists: ${existing.id} (stage: ${existing.stage})`);
      continue;
    }

    const [row] = await db
      .insert(contact)
      .values({ name: lead.name, phone: lead.phone, stage: "LEAD", source: "PREDICT" })
      .returning();

    console.log(`Created ${lead.name}: ${row!.id} (phone: ${lead.phone}, status: LEAD)`);
  }
  process.exit(0);
}

main();
