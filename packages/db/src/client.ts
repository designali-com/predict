import "dotenv/config";
// Defaults for every setting, so the demo runs with no environment at all.
import "./demo-env";
import { Pool } from "pg";
import * as schema from "./schema";
import { drizzle } from "drizzle-orm/node-postgres";

// DATABASE_URL must point at the *pooled* endpoint. node-postgres holds real
// connections, so on Vercel every warm function instance keeps its own pool —
// a default pool of 10 across a few dozen concurrent instances exhausts
// Postgres. One connection per serverless instance, a normal pool for the
// long-running automation worker, and DB_POOL_MAX to override either.
const poolMax = Number(
  process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 1 : 10),
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: poolMax,
  // Transaction-mode pooling assigns a backend per transaction rather than
  // per connection, so an idle handle is not worth holding open.
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});

export const db = drizzle(pool, { schema });
