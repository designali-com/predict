import { sql, type SQL } from "@workspace/db";
import { contact } from "@workspace/db/schema";
import { DomainEventType } from "@workspace/db/domain-events";
import type { OperationalStage } from "@workspace/db/operational-stage";

/**
 * One CASE expression that labels every contact with its operational stage,
 * used by both the Home funnel (grouped, for counts) and the People list
 * (filtered, for the rows behind a count). Sharing it is the point: two
 * separate definitions would drift, and then clicking a funnel number would
 * show a different set of people than the number claimed.
 *
 * Written as raw SQL rather than assembled with the query builder because the
 * branches have to be evaluated in order inside a single CASE — a contact must
 * land in exactly one bucket, and "most advanced wins" is only expressible as
 * an ordered CASE, not as a set of independent conditions.
 *
 * The outer table is referenced through drizzle's own column objects
 * (rendered as "contact"."id"), never a hand-written alias, so this composes
 * into an ordinary .from(contact) query without the caller having to alias
 * anything.
 *
 * Correlated EXISTS everywhere, never joins: joining to messages or
 * appointments would multiply a contact by their row count and inflate every
 * number in the funnel.
 */

const HAS_INBOUND = sql`exists (
  select 1 from communication_message m
  where m.contact_id = ${contact.id} and m.direction = 'inbound'
)`;

const HAS_OPEN_TASK = sql`exists (
  select 1 from task t
  where t.contact_id = ${contact.id} and t.status = 'open'
)`;

// Someone whose newest message is theirs is waiting on us, whether or not a
// task was ever raised — the same rule Home's "Waiting on us" panel uses.
const AWAITING_OUR_REPLY = sql`exists (
  select 1 from communication_message m
  where m.contact_id = ${contact.id}
    and m.direction = 'inbound'
    and m.created_at = (
      select max(m2.created_at) from communication_message m2
      where m2.contact_id = ${contact.id}
    )
)`;

const HAS_ACTIVE_RUN = sql`exists (
  select 1 from automation_flow_run r
  where r.contact_id = ${contact.id} and r.status in ('running', 'waiting')
)`;

// "Trying to book" has no column of its own and should not get one — it is
// fully implied by having asked. Either the request event was emitted for them
// (the nurture flow's "Schedule an appointment" button, a staff action, the
// website), or a run of a booking flow is live for them right now.
const HAS_BOOKING_INTENT = sql`(
  exists (
    select 1 from lifecycle_event e
    where e.contact_id = ${contact.id} and e.type = ${DomainEventType.APPOINTMENT_REQUESTED}
  )
  or exists (
    select 1 from automation_flow_run r
    join automation_flow f on f.id = r.flow_id
    where r.contact_id = ${contact.id}
      and r.status in ('running', 'waiting')
      and f.trigger_event_type = ${DomainEventType.APPOINTMENT_REQUESTED}
  )
)`;

const HAS_LIVE_APPOINTMENT = sql`exists (
  select 1 from appointment a
  where a.contact_id = ${contact.id} and a.status not in ('cancelled', 'no_show')
)`;

const HAS_COMPLETED_APPOINTMENT = sql`exists (
  select 1 from appointment a
  where a.contact_id = ${contact.id} and a.status = 'completed'
)`;

/**
 * Branches run most-advanced first, so the first match wins. A lead who is
 * mid-booking AND has an open task counts once, as Appointment pending —
 * otherwise the columns overlap and the funnel stops summing to the number of
 * people on record.
 *
 * Contacts in INACTIVE / LOST return null: they are exits, not funnel steps,
 * and belong in the side filters instead.
 */
export const operationalStageExpr: SQL = sql`
  case
    when ${contact.stage} = 'PATIENT' then 'PATIENT'
    when ${contact.stage} = 'BOOKED' and ${HAS_COMPLETED_APPOINTMENT} then 'ATTENDED'
    when ${contact.stage} = 'BOOKED' then 'BOOKED'
    when ${contact.stage} = 'LEAD' and ${HAS_BOOKING_INTENT} and not ${HAS_LIVE_APPOINTMENT}
      then 'APPOINTMENT_PENDING'
    when ${contact.stage} = 'LEAD' and (${HAS_OPEN_TASK} or ${AWAITING_OUR_REPLY})
      then 'HUMAN_FOLLOW_UP'
    when ${contact.stage} = 'LEAD' and ${HAS_INBOUND} then 'ENGAGED'
    when ${contact.stage} = 'LEAD' and ${HAS_ACTIVE_RUN} then 'NURTURING'
    when ${contact.stage} = 'LEAD' then 'NEW_LEAD'
    else null
  end
`;

/** Rows that a side filter selects. These sit outside the funnel on purpose. */
export const SIDE_FILTER_SQL: Record<string, SQL> = {
  INACTIVE: sql`${contact.stage} = 'INACTIVE'`,
  LOST: sql`${contact.stage} = 'LOST'`,
  DO_NOT_CONTACT: sql`${contact.engagement} = 'DO_NOT_CONTACT'`,
  NO_SHOW: sql`exists (
    select 1 from appointment a
    where a.contact_id = ${contact.id} and a.status = 'no_show'
  )`,
  CANCELLED: sql`exists (
    select 1 from appointment a
    where a.contact_id = ${contact.id} and a.status = 'cancelled'
  )`,
};

export function isOperationalStage(value: unknown): value is OperationalStage {
  return (
    typeof value === "string" &&
    [
      "NEW_LEAD",
      "NURTURING",
      "ENGAGED",
      "HUMAN_FOLLOW_UP",
      "APPOINTMENT_PENDING",
      "BOOKED",
      "ATTENDED",
      "PATIENT",
    ].includes(value)
  );
}
