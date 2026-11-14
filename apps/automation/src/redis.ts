import "dotenv/config";
import { Redis } from "ioredis";

// BullMQ requires this exact setting on the connection it's given.
// lazyConnect: nothing dials Redis until a command is sent — importing this
// (as a few API routes do, through the queue) must not open a connection,
// or a deploy without Redis (the demo on Vercel) hangs retrying it.
export const redisConnection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6380",
  { maxRetriesPerRequest: null, lazyConnect: true },
);
