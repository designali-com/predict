const fs = require("fs");
const { Client } = require("pg");

async function main() {
  const file = process.argv[2];
  const sql = fs.readFileSync(file, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let ok = 0;
  for (const [i, statement] of statements.entries()) {
    try {
      await client.query(statement);
      ok += 1;
    } catch (e) {
      console.log(`statement ${i + 1} FAILED: ${e.message}`);
      console.log(statement.slice(0, 200));
    }
  }

  console.log(`${ok}/${statements.length} statements ok`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
