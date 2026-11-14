import { db } from "@workspace/db/client";
import { sql } from "@workspace/db";

/**
 * What the WhatsApp automations do, from the message to the money.
 *
 *   flows  — every flow that ran in the period: runs, replies, bookings,
 *            visits, revenue. Which automation is worth its messages.
 *   weekly — one flow, cohort by the week its leads entered (IST, Monday
 *            first): entered → sent → delivered → read → replied → booked →
 *            visited → paid, and revenue. A lead that entered in week 1 and
 *            paid in week 3 counts in week 1 — the week that earned it.
 *   steps  — one flow, message by message: sent, delivered, read, failed,
 *            and how many replied within 48 hours of it. Where the flow
 *            loses people.
 *
 * A person counts once per flow — their first run in the period. After
 * entering: replied = any message from them, booked = an appointment made,
 * visited = arrived for one (or Visited), paid = a payment not voided.
 *
 * Built from joins and one pass per table, not a subquery per person: the
 * message table is large and the per-person version took half a minute.
 *
 * Timestamps are UTC wall times (drizzle writes them so); IST weeks add
 * 5:30 before truncating.
 */

const IST = sql.raw(`interval '5 hours 30 minutes'`);

type Num = number | string | null;
const n = (v: Num | undefined) => Number(v ?? 0);

export interface FlowSummary {
  id: string;
  name: string;
  status: string;
  trigger: string;
  entered: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  booked: number;
  visited: number;
  paid: number;
  revenueInPaise: number;
}
export type WeekRow = Omit<FlowSummary, "id" | "name" | "status" | "trigger"> & { week: string };
export interface StepRow {
  step: string;
  day: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
}

type Person = {
  flow_id: string;
  week: string;
  sent: boolean;
  delivered: boolean;
  read: boolean;
  replied: boolean;
  booked: boolean;
  visited: boolean;
  revenue: Num;
};

const blank = () => ({ entered: 0, sent: 0, delivered: 0, read: 0, replied: 0, booked: 0, visited: 0, paid: 0, revenueInPaise: 0 });

export async function automationReport({
  clinicId,
  weeks,
  flowId: asked,
}: {
  clinicId: string | null;
  weeks: number;
  flowId: string | null;
}): Promise<{ weeks: number; flowId: string | null; flows: FlowSummary[]; weekly: WeekRow[]; steps: StepRow[] }> {
  // From the Monday `weeks` weeks back, IST, as a UTC wall time.
  const since = sql`(date_trunc('week', (now() at time zone 'utc') + ${IST}) - ${IST} - ${sql.raw(`interval '${weeks - 1} weeks'`)})`;
  const clinicFilter = clinicId ? sql`c.clinic_id = ${clinicId}` : sql`true`;

  const firstRuns = sql`
    first_runs as (
      select distinct on (r.flow_id, r.contact_id) r.id, r.flow_id, r.contact_id, r.started_at, c.lead_status
      from automation_flow_run r
      join contact c on c.id = r.contact_id
      where r.started_at >= ${since} and ${clinicFilter}
      order by r.flow_id, r.contact_id, r.started_at
    )`;

  // One row per person per flow, with what followed — everything else is
  // counted from this in JS.
  const people = (
    await db.execute(sql`
      with ${firstRuns},
      run_msgs as (
        select m.run_id,
          bool_or(m.status <> 'skipped_no_consent') as sent,
          bool_or(m.status in ('delivered', 'read')) as delivered,
          bool_or(m.status = 'read') as read
        from communication_message m
        join first_runs f on f.id = m.run_id
        where m.direction = 'outbound'
        group by m.run_id
      ),
      replies as (
        select distinct f.id as run_id
        from first_runs f
        join communication_message m on m.contact_id = f.contact_id
        where m.direction = 'inbound' and m.created_at >= f.started_at
      ),
      appts as (
        select f.id as run_id, bool_or(a.arrived_at is not null) as arrived
        from first_runs f
        join appointment a on a.contact_id = f.contact_id and a.created_at >= f.started_at
        group by f.id
      ),
      paid as (
        select f.id as run_id, sum(p.amount_in_paise) as revenue
        from first_runs f
        join payment p on p.contact_id = f.contact_id and p.voided_at is null and p.collected_at >= f.started_at
        group by f.id
      )
      select f.flow_id,
        to_char(date_trunc('week', f.started_at + ${IST}), 'YYYY-MM-DD') as week,
        coalesce(rm.sent, false) as sent,
        coalesce(rm.delivered, false) as delivered,
        coalesce(rm.read, false) as read,
        rp.run_id is not null as replied,
        ap.run_id is not null as booked,
        (coalesce(ap.arrived, false) or f.lead_status = 'VISITED') as visited,
        coalesce(pd.revenue, 0) as revenue
      from first_runs f
      left join run_msgs rm on rm.run_id = f.id
      left join replies rp on rp.run_id = f.id
      left join appts ap on ap.run_id = f.id
      left join paid pd on pd.run_id = f.id
    `)
  ).rows as unknown as Person[];

  const add = (acc: ReturnType<typeof blank>, p: Person) => {
    acc.entered++;
    if (p.sent) acc.sent++;
    if (p.delivered) acc.delivered++;
    if (p.read) acc.read++;
    if (p.replied) acc.replied++;
    if (p.booked) acc.booked++;
    if (p.visited) acc.visited++;
    if (n(p.revenue) > 0) {
      acc.paid++;
      acc.revenueInPaise += n(p.revenue);
    }
  };

  const byFlow = new Map<string, ReturnType<typeof blank>>();
  for (const p of people) {
    const acc = byFlow.get(p.flow_id) ?? blank();
    add(acc, p);
    byFlow.set(p.flow_id, acc);
  }

  const meta = byFlow.size
    ? ((
        await db.execute(
          sql`select id, name, status, trigger_event_type as trigger from automation_flow where id in (${sql.join(
            [...byFlow.keys()].map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
      ).rows as { id: string; name: string; status: string; trigger: string }[])
    : [];

  const flows: FlowSummary[] = meta
    .map((m) => ({ id: m.id, name: m.name, status: m.status, trigger: m.trigger, ...byFlow.get(m.id)! }))
    .sort((a, b) => b.entered - a.entered);

  // The flow to open: the one asked for, else the one with the most leads.
  const flowId = flows.find((f) => f.id === asked)?.id ?? flows[0]?.id ?? null;
  if (!flowId) return { weeks, flowId, flows, weekly: [], steps: [] };

  const byWeek = new Map<string, ReturnType<typeof blank>>();
  for (const p of people) {
    if (p.flow_id !== flowId) continue;
    const acc = byWeek.get(p.week) ?? blank();
    add(acc, p);
    byWeek.set(p.week, acc);
  }
  const weekly: WeekRow[] = [...byWeek.entries()]
    .map(([week, v]) => ({ week, ...v }))
    .sort((a, b) => (a.week < b.week ? 1 : -1));

  // Message by message, in the order the flow sends them (by how long after
  // entering each usually goes).
  const stepRows = (
    await db.execute(sql`
      with ${firstRuns},
      runs as (select * from first_runs where flow_id = ${flowId}),
      msgs as (
        select m.contact_id, m.status, m.created_at, r.started_at,
          coalesce(t.name, t.key, 'Text message') as step
        from communication_message m
        join runs r on r.id = m.run_id
        left join communication_template t on t.id = m.template_id
        where m.direction = 'outbound' and m.status <> 'skipped_no_consent'
      ),
      inbound as (
        select m.contact_id, m.created_at
        from communication_message m
        join runs r on r.contact_id = m.contact_id
        where m.direction = 'inbound'
      ),
      answered as (
        select distinct s.step, s.contact_id
        from msgs s
        join inbound i on i.contact_id = s.contact_id
          and i.created_at > s.created_at and i.created_at <= s.created_at + interval '48 hours'
      )
      select s.step,
        count(*)::int as sent,
        count(*) filter (where s.status in ('delivered', 'read'))::int as delivered,
        count(*) filter (where s.status = 'read')::int as read,
        count(*) filter (where s.status = 'failed')::int as failed,
        (select count(*) from answered a where a.step = s.step)::int as replied,
        percentile_cont(0.5) within group (order by extract(epoch from (s.created_at - s.started_at))) as offset_s
      from msgs s
      group by s.step
      order by offset_s nulls last
    `)
  ).rows as Record<string, Num>[];

  const steps: StepRow[] = stepRows.map((r) => ({
    step: String(r.step),
    // Days after entering, as the flow usually sends it.
    day: Math.max(0, Math.round(n(r.offset_s) / 86_400)),
    sent: n(r.sent),
    delivered: n(r.delivered),
    read: n(r.read),
    failed: n(r.failed),
    replied: n(r.replied),
  }));

  return { weeks, flowId, flows, weekly, steps };
}
