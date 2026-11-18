import "dotenv/config";
import "./src/demo-env";
import { defineConfig } from "drizzle-kit";

// Migrations and DDL must not go through the transaction-mode pooler — it
// hands out a different backend per transaction, which breaks schema changes
// and any session-scoped state. DIRECT_URL is the same database on the
// non-pooled hostname; DATABASE_URL is only a fallback for local Postgres,
// where the two are the same thing.
const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DIRECT_URL (or DATABASE_URL) must be set to run migrations");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
