import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { adherenceLog, carePlanItem } from "@workspace/db/schema";
import { and, eq, gte, lte, sql } from "@workspace/db";
import {
  CARE_PLAN_SLOTS,
  creditFor,
  orderSlots,
  scoreDay,
  type AdherenceDay,
} from "@workspace/db/care-plan";
import { requireOperations } from "@/src/lib/auth/guards";

const VALID_SLOTS = CARE_PLAN_SLOTS.map((s) => s.value) as string[];
const VALID_STATUSES = ["done", "partial", "missed"];
const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar day. toISOString() renders UTC and names the wrong day. */
function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    days.push(toLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * A day's worth of adherence for one contact, plus the per-slot detail behind
 * it, over a date range.
 *
 * The expected count is recomputed per day from the plan rather than stored,
 * because an item's slots and its start/end dates both change over time. A
 * cached "3 doses a day" would silently rescore every past day the moment a
 * doctor changed the prescription.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);

  const to = url.searchParams.get("to") ?? toLocalDate(new Date());
  const fromParam = url.searchParams.get("from");
  const from =
    fromParam ??
    (() => {
      const d = new Date(`${to}T00:00:00`);
      d.setDate(d.getDate() - (DEFAULT_DAYS - 1));
      return toLocalDate(d);
    })();

  const days = eachDay(from, to);
  if (days.length === 0 || days.length > MAX_DAYS) {
    return NextResponse.json(
      { error: `Range must be between 1 and ${MAX_DAYS} days` },
      { status: 400 },
    );
  }

  // Anything that overlaps the window at all — an item that ended mid-range
  // still counted on the days before it ended.
  const items = await db
    .select()
    .from(carePlanItem)
    .where(and(eq(carePlanItem.contactId, id), lte(carePlanItem.startDate, to)));

  const logs = await db
    .select()
    .from(adherenceLog)
    .where(
      and(
        eq(adherenceLog.contactId, id),
        gte(adherenceLog.loggedForDate, from),
        lte(adherenceLog.loggedForDate, to),
      ),
    );

  const activeOn = (item: (typeof items)[number], day: string) =>
    item.startDate <= day && (item.endDate === null || item.endDate >= day);

  const calendar: (AdherenceDay & {
    slots: { itemId: string; itemName: string; slot: string; status: string | null }[];
  })[] = days.map((day) => {
    const dueItems = items.filter((i) => activeOn(i, day));

    const slots = dueItems.flatMap((item) =>
      orderSlots(item.slots).map((slot) => {
        const log = logs.find(
          (l) => l.carePlanItemId === item.id && l.slot === slot && l.loggedForDate === day,
        );
        return { itemId: item.id, itemName: item.name, slot, status: log?.status ?? null };
      }),
    );

    const expected = slots.length;
    const completed = slots.reduce((sum, s) => sum + (s.status ? creditFor(s.status) : 0), 0);

    return { date: day, expected, completed, rate: scoreDay(expected, completed), slots };
  });

  const scored = calendar.filter((d) => d.rate !== null);
  const overall =
    scored.length === 0
      ? null
      : scored.reduce((sum, d) => sum + (d.rate ?? 0), 0) / scored.length;

  return NextResponse.json({
    from,
    to,
    calendar,
    overall,
    // Entries with no care plan item behind them — real activity, but nothing
    // to score, so they are surfaced separately rather than folded into a
    // percentage they cannot contribute to.
    unlinked: logs
      .filter((l) => !l.carePlanItemId)
      .map((l) => ({
        id: l.id,
        logType: l.logType,
        status: l.status,
        note: l.note,
        loggedForDate: l.loggedForDate,
        loggedAt: l.loggedAt,
      })),
  });
}

/** Record (or correct) one slot on one day. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const itemId = typeof body?.carePlanItemId === "string" ? body.carePlanItemId : "";
  const slot = typeof body?.slot === "string" ? body.slot : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const forDate = typeof body?.loggedForDate === "string" ? body.loggedForDate : toLocalDate(new Date());

  if (!itemId) return NextResponse.json({ error: "carePlanItemId is required" }, { status: 400 });
  if (!VALID_SLOTS.includes(slot)) return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "status must be done, partial or missed" }, { status: 400 });
  }

  const [item] = await db
    .select()
    .from(carePlanItem)
    .where(and(eq(carePlanItem.id, itemId), eq(carePlanItem.contactId, id)))
    .limit(1);
  if (!item) return NextResponse.json({ error: "Care plan item not found" }, { status: 404 });

  // Correcting a slot overwrites it. Appending instead would let one
  // prescribed dose be reported done three times and push that day above 100%.
  const [row] = await db
    .insert(adherenceLog)
    .values({
      contactId: id,
      carePlanItemId: itemId,
      logType: item.type === "supplement" ? "medication" : item.type,
      slot,
      loggedForDate: forDate,
      status,
      note: typeof body?.note === "string" && body.note ? body.note : null,
      source: "staff",
    })
    .onConflictDoUpdate({
      target: [adherenceLog.carePlanItemId, adherenceLog.slot, adherenceLog.loggedForDate],
      // The unique index is partial — rows predating the care plan have no item
      // and no date, and must stay. Postgres will only infer a partial index
      // when ON CONFLICT repeats its predicate, so this has to match the index
      // in 0008_care_plan.sql exactly or the upsert fails at runtime.
      targetWhere: sql`${adherenceLog.carePlanItemId} is not null and ${adherenceLog.loggedForDate} is not null`,
      set: { status, loggedAt: new Date(), source: "staff" },
    })
    .returning();

  return NextResponse.json({ log: row }, { status: 201 });
}
