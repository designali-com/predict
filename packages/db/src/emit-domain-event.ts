import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { lifecycleEvent } from "./schema";
import type * as schema from "./schema";
import type { DomainEventType } from "./domain-events";

const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * Records a domain event. Pass the same idempotencyKey for a logical event
 * that might be emitted more than once (retried webhook, duplicate trigger)
 * — a repeat call is a safe no-op (returns null) rather than a duplicate row.
 * Call it with a transaction handle to make the event durable in the same
 * transaction as the write that caused it.
 */
export async function emitDomainEvent(
  db: NodePgDatabase<typeof schema>,
  type: DomainEventType,
  payload: Record<string, unknown>,
  options?: { contactId?: string; idempotencyKey?: string },
) {
  try {
    const [row] = await db
      .insert(lifecycleEvent)
      .values({
        type,
        contactId: options?.contactId,
        payload: JSON.stringify(payload),
        idempotencyKey: options?.idempotencyKey,
      })
      .returning();
    return row ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return null;
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } } | undefined)?.cause;
  return cause?.code === POSTGRES_UNIQUE_VIOLATION;
}
