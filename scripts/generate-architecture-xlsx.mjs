#!/usr/bin/env node
/**
 * Regenerates PredictFit-Architecture.xlsx from scripts/architecture-data.mjs.
 *
 *   pnpm arch:xlsx
 *
 * Keep the data in architecture-data.mjs, not in the spreadsheet — the .xlsx
 * is a build output and any manual edit to it is lost on the next run.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeXlsx } from "./xlsx-writer.mjs";
import { sheets } from "./architecture-data.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "PredictFit-Architecture.xlsx");

writeXlsx(sheets, outPath);

const totalRows = sheets.reduce((sum, s) => sum + s.rows.length, 0);
console.log(`Wrote ${outPath}`);
console.log(`  ${sheets.length} sheets, ${totalRows} data rows`);
for (const sheet of sheets) {
  console.log(`  - ${sheet.name} (${sheet.rows.length} rows)`);
}
