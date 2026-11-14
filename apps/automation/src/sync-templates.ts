import "dotenv/config";
import { syncTemplatesFromMeta } from "./lib/sync-templates-from-meta";

// CLI form of the templates page's refresh button — same code path, so a
// cron entry and a click stay in agreement. Usage: pnpm sync:templates
const result = await syncTemplatesFromMeta();

if (!result.ok) {
  console.error(`Sync failed: ${result.error}`);
  process.exit(1);
}

for (const c of result.changes) {
  console.log(`sync  ${c.key} — ${c.field}: ${c.from ?? "—"} -> ${c.to ?? "—"}`);
}
for (const key of result.missingOnMeta) {
  console.log(`skip  ${key} — not found on the WABA`);
}

console.log(
  `\n${result.checked} template(s) checked, ${result.updated} updated.`,
);
process.exit(0);
