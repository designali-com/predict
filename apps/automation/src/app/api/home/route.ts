import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  contact,
  task,
  appointment,
  automationFlow,
  automationFlowRun,
  communicationMessage,
  communicationTemplate,
} from "@workspace/db/schema";
import { and, count, countDistinct, desc, eq, gte, inArray, isNotNull, lt, sql } from "@workspace/db";
import { requireClinicAnyPermission } from "@/src/lib/auth/clinic";
import { OPS_KEYS } from "@workspace/db/permissions";
import { operationalStageExpr, SIDE_FILTER_SQL } from "@/src/lib/operational-stage-sql";

// Meta's customer-service window. An inbound message we haven't answered is
// only actionable for 24 hours — after that a free-form reply is rejected and
// only a template gets through, so the countdown is the whole point of
// surfacing these.
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENT_FAILURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface AwaitingRow {
  contactId: string;
  conversationId: string;
  createdAt: string;
  name: string | null;
  phone: string | null;
  body: string | null;
}

/**
 * The home screen's two jobs: show the funnel the product actually runs, and
 * show what is stuck in it right now.
 *
 * Every number here is derived, never stored — there is no "pipeline" table.
 * The funnel is contact.stage plus live run/appointment counts; "needs
 * attention" is the set of things a human has to unblock, because automation
 * either finished its part or failed.
 */
export async function GET() {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = context.session;
  const clinicId = context.clinic.id;

  const now = new Date();
  const failureCutoff = new Date(now.getTime() - RECENT_FAILURE_WINDOW_MS);

  const [
    operationalRows,
    sideRows,
    stageRows,
    inNurtureRows,
    upcomingRows,
    flowRows,
    overdueTaskRows,
    openTaskRows,
    failedSendRows,
    failedRunRows,
  ] = await Promise.all([
    // The funnel the console shows. Each contact falls into exactly one
    // bucket (see operationalStageExpr), so these sum to the number of people
    // in the funnel rather than double-counting anyone.
    // Labelled in a subquery, then counted. Postgres will not accept the
    // CASE in a HAVING clause here — with bound parameters inside it, it no
    // longer matches the GROUP BY expression and the planner rejects it.
    db.execute(sql`
      select stage, count(*)::int as n
      from (select ${operationalStageExpr} as stage from contact) labelled
      where stage is not null
      group by stage
    `),

    // Exits and flags — outside the funnel on purpose.
    db.execute(sql`
      select
        count(*) filter (where ${SIDE_FILTER_SQL.INACTIVE})::int       as "INACTIVE",
        count(*) filter (where ${SIDE_FILTER_SQL.LOST})::int           as "LOST",
        count(*) filter (where ${SIDE_FILTER_SQL.NO_SHOW})::int        as "NO_SHOW",
        count(*) filter (where ${SIDE_FILTER_SQL.CANCELLED})::int      as "CANCELLED",
        count(*) filter (where ${SIDE_FILTER_SQL.DO_NOT_CONTACT})::int as "DO_NOT_CONTACT"
      from contact
    `),

    db
      .select({ stage: contact.stage, n: count() })
      .from(contact)
      .where(eq(contact.clinicId, clinicId))
      .groupBy(contact.stage),

    // Distinct people, not runs — one contact can legitimately be in two
    // flows at once, and counting runs would double-count them in the funnel.
    db
      .select({ n: countDistinct(automationFlowRun.contactId) })
      .from(automationFlowRun)
      .where(
        and(
          inArray(automationFlowRun.status, ["running", "waiting"]),
          isNotNull(automationFlowRun.contactId),
        ),
      ),

    db
      .select({ n: countDistinct(appointment.contactId) })
      .from(appointment)
      .where(
        and(
          gte(appointment.scheduledAt, now),
          inArray(appointment.status, ["scheduled", "confirmed"]),
        ),
      ),

    db.select({ status: automationFlow.status, n: count() }).from(automationFlow).groupBy(automationFlow.status),

    db
      .select({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt,
        assignedRole: task.assignedRole,
        contactId: task.contactId,
        contactName: contact.name,
      })
      .from(task)
      .leftJoin(contact, eq(task.contactId, contact.id))
      .where(and(eq(task.status, "open"), isNotNull(task.dueAt), lt(task.dueAt, now)))
      .orderBy(task.dueAt)
      .limit(10),

    db.select({ n: count() }).from(task).where(eq(task.status, "open")),

    db
      .select({
        id: communicationMessage.id,
        createdAt: communicationMessage.createdAt,
        contactId: communicationMessage.contactId,
        contactName: contact.name,
        contactPhone: contact.phone,
        templateName: communicationTemplate.name,
        status: communicationMessage.status,
      })
      .from(communicationMessage)
      .leftJoin(contact, eq(communicationMessage.contactId, contact.id))
      .leftJoin(communicationTemplate, eq(communicationMessage.templateId, communicationTemplate.id))
      .where(
        and(
          eq(communicationMessage.direction, "outbound"),
          inArray(communicationMessage.status, ["failed", "skipped_no_consent"]),
          gte(communicationMessage.createdAt, failureCutoff),
        ),
      )
      .orderBy(desc(communicationMessage.createdAt))
      .limit(10),

    db
      .select({
        id: automationFlowRun.id,
        startedAt: automationFlowRun.startedAt,
        flowName: automationFlow.name,
        contactId: automationFlowRun.contactId,
        contactName: contact.name,
      })
      .from(automationFlowRun)
      .innerJoin(automationFlow, eq(automationFlowRun.flowId, automationFlow.id))
      .leftJoin(contact, eq(automationFlowRun.contactId, contact.id))
      .where(and(eq(automationFlowRun.status, "failed"), gte(automationFlowRun.startedAt, failureCutoff)))
      .orderBy(desc(automationFlowRun.startedAt))
      .limit(10),
  ]);

  // Threads whose most recent message came from them. DISTINCT ON is the one
  // clean way to ask "latest row per conversation" in Postgres — the
  // alternative is fetching every message and reducing in JS, which silently
  // stops being correct once the table outgrows whatever limit was chosen.
  const awaitingResult = await db.execute(sql`
    with latest as (
      select distinct on (m.conversation_id)
        m.conversation_id, m.direction, m.created_at, m.contact_id, m.body
      from communication_message m
      order by m.conversation_id, m.created_at desc
    )
    select
      l.contact_id      as "contactId",
      l.conversation_id as "conversationId",
      l.created_at      as "createdAt",
      l.body            as "body",
      c.name            as "name",
      c.phone           as "phone"
    from latest l
    join contact c on c.id = l.contact_id
    where l.direction = 'inbound'
    order by l.created_at desc
    limit 25
  `);

  const awaitingReply = (awaitingResult.rows as unknown as AwaitingRow[]).map((row) => {
    const receivedAt = new Date(row.createdAt);
    const msLeft = receivedAt.getTime() + SESSION_WINDOW_MS - now.getTime();
    return {
      contactId: row.contactId,
      conversationId: row.conversationId,
      name: row.name,
      phone: row.phone,
      body: row.body,
      receivedAt,
      // Negative means the window has already shut: a free-form reply will be
      // rejected and only an approved template can reach them now.
      hoursLeft: Math.floor(msLeft / (60 * 60 * 1000)),
      windowOpen: msLeft > 0,
    };
  });

  const byStage = Object.fromEntries(stageRows.map((r) => [r.stage, r.n]));
  const byFlowStatus = Object.fromEntries(flowRows.map((r) => [r.status, r.n]));

  const funnel = Object.fromEntries(
    (operationalRows.rows as unknown as { stage: string; n: number }[]).map((r) => [r.stage, r.n]),
  );
  const side = (sideRows.rows as unknown as Record<string, number>[])[0] ?? {};

  return NextResponse.json({
    // Eight operational stages, derived. contact.stage holds five lifecycle
    // values and is returned separately below — the two are different
    // questions and are deliberately not the same list.
    funnel,
    side,
    lifecycle: {
      LEAD: byStage.LEAD ?? 0,
      BOOKED: byStage.BOOKED ?? 0,
      PATIENT: byStage.PATIENT ?? 0,
      INACTIVE: byStage.INACTIVE ?? 0,
      LOST: byStage.LOST ?? 0,
    },
    inNurture: inNurtureRows[0]?.n ?? 0,
    upcomingAppointments: upcomingRows[0]?.n ?? 0,
    flows: {
      active: byFlowStatus.active ?? 0,
      draft: byFlowStatus.draft ?? 0,
    },
    openTasks: openTaskRows[0]?.n ?? 0,
    attention: {
      awaitingReply,
      overdueTasks: overdueTaskRows,
      failedSends: failedSendRows,
      failedRuns: failedRunRows,
    },
  });
}
