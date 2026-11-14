import { db } from "@workspace/db/client";
import { contact, communicationMessage, appointment } from "@workspace/db/schema";
import { isLeadStatus } from "@workspace/db/lead-status";
import { leadScope, leadVisibility } from "@/src/lib/lead-access";
import { and, eq, exists, ilike, inArray, isNotNull, isNull, notExists, or, sql, type SQL } from "@workspace/db";
import { isContactStage } from "@workspace/db/contact-stage";
import { grantedPermissions } from "@workspace/db/permission-service";
import { isContactSide, SIDE_STAGES, sidesFor, stagesForSides, type ContactSide } from "@workspace/db/contact-side";
import { isOperationalStage, operationalStageExpr, SIDE_FILTER_SQL } from "@/src/lib/operational-stage-sql";
import { isRegion, REGION_SQL } from "@/src/lib/region-sql";

type ClinicContext = NonNullable<Awaited<ReturnType<typeof import("@/src/lib/auth/clinic").requireClinicAnyPermission>>>;

/**
 * The WHERE clause behind the people lists, from the list page query string.
 * Shared by the list itself and its export, so an export is always exactly
 * the rows the filters on screen select — never more than this person may see.
 */
export async function leadListQuery(url: URL, context: ClinicContext) {
  const stage = url.searchParams.get("stage");
  const query = url.searchParams.get("q")?.trim();
  // The broadcast action can only reach contacts with a phone number, so the
  // list defaults to hiding rows it could never message — otherwise "select
  // all" silently includes contacts that will fail at send time.
  const withPhoneOnly = url.searchParams.get("withPhone") !== "false";
  // "They answered, and it still went nowhere" — the cohort that is invisible
  // everywhere else. A lead who never replied is the nurture flow's problem;
  // a lead who replied and still has no appointment is a person's problem,
  // and nothing surfaced them before this.
  const engagedNotConverted = url.searchParams.get("engagedNotConverted") === "true";
  // The funnel on Home links here with ?operationalStage=... — the same
  // expression produces both the count and these rows, so a number and the
  // list behind it can never disagree.
  const operationalStage = url.searchParams.get("operationalStage");
  const sideFilter = url.searchParams.get("side");

  // Which of the two lists is asking. People used to be one screen behind one
  // permission; now the rows a caller may see are bounded by the lists they
  // hold, whether or not they said which one they wanted. An explicit ?list=
  // they do not hold is a 403 rather than a silent fallback — a page asking
  // for rows it cannot have is a bug worth seeing, not one to paper over.
  // Permissions come from the role held in THIS clinic — the same person
  // can be a telecaller here and a manager next door.
  const held = await grantedPermissions(db, context.principal);
  const allowedSides = sidesFor(held);
  if (!allowedSides.length) return { error: "Forbidden" as const };

  const requested = url.searchParams.get("list");
  let sides: ContactSide[];
  if (requested) {
    if (!isContactSide(requested) || !allowedSides.includes(requested)) {
      return { error: "Forbidden" as const };
    }
    sides = [requested];
  } else {
    sides = allowedSides;
  }

  const visibleStages = stagesForSides(sides);

  // Every list in the product is a list of one clinic's people. This is the
  // filter that makes that true for leads and patients.
  // A lead that arrived before a clinic was stamped is still this clinic's
  // work when it is the only one — hiding it made the leads page look empty.
  const filters: SQL[] = [
    inArray(contact.stage, visibleStages),
    or(eq(contact.clinicId, context.clinic.id), isNull(contact.clinicId))!,
  ];

  // A telecaller-type role (ops.leads without ops.leads_all) sees only the
  // leads routed to them or to their role's pool. Patients are not narrowed.
  const scope = await leadScope(context.principal);
  const restricted = leadVisibility(scope);
  if (restricted && sides.includes("leads")) {
    filters.push(
      sides.includes("patients")
        ? or(inArray(contact.stage, SIDE_STAGES.patients), restricted)!
        : restricted,
    );
  }

  // Every filter below takes several values, comma separated: a row matches
  // when it matches any of them. Filters of different kinds still combine
  // with AND.
  const many = (key: string) => (url.searchParams.get(key) ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const anyOf = (conds: (SQL | undefined)[]) => {
    const kept = conds.filter((c): c is SQL => !!c);
    if (kept.length) filters.push(kept.length === 1 ? kept[0]! : or(...kept)!);
  };

  const leadStatuses = many("leadStatus");
  anyOf([
    leadStatuses.includes("OPEN")
      ? or(
          sql`${contact.leadStatus} is null`,
          sql`${contact.leadStatus} not in ('VISITED','NOT_INTERESTED','INVALID_NUMBER','DUPLICATE','LOST')`,
        )
      : undefined,
    ...(() => {
      const exact = leadStatuses.filter(isLeadStatus);
      return exact.length ? [inArray(contact.leadStatus, exact)] : [];
    })(),
  ]);

  const assignees = many("assignee");
  anyOf(
    assignees.map((a) =>
      a === "me"
        ? eq(contact.assignedUserId, scope.userId)
        : a === "unassigned"
          ? sql`${contact.assignedUserId} is null`
          : scope.all
            ? eq(contact.assignedUserId, a)
            : undefined,
    ),
  );

  const interests = many("interest");
  if (interests.length) filters.push(inArray(contact.interest, interests));

  // Delhi NCR / Kolkata / other — campaign first, then the city they typed.
  anyOf(many("region").filter(isRegion).map((r) => REGION_SQL[r]));
  if (url.searchParams.get("callbackDue") === "true") {
    filters.push(sql`${contact.callbackAt} is not null and ${contact.callbackAt} <= now() + interval '1 day'`);
  }
  const opStages = (operationalStage ?? "").split(",").filter(isOperationalStage);
  if (opStages.length) {
    filters.push(sql`${operationalStageExpr} in (${sql.join(opStages.map((s) => sql`${s}`), sql`, `)})`);
  }
  anyOf((sideFilter ?? "").split(",").map((f) => SIDE_FILTER_SQL[f]));
  const storedStages = (stage ?? "").split(",").filter(isContactStage);
  if (storedStages.length) filters.push(inArray(contact.stage, storedStages));
  if (engagedNotConverted) {
    filters.push(eq(contact.stage, "LEAD"));
    filters.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(communicationMessage)
          .where(
            and(
              eq(communicationMessage.contactId, contact.id),
              eq(communicationMessage.direction, "inbound"),
            ),
          ),
      ),
    );
    filters.push(
      notExists(
        db
          .select({ one: sql`1` })
          .from(appointment)
          .where(
            and(
              eq(appointment.contactId, contact.id),
              sql`${appointment.status} != 'cancelled'`,
            ),
          ),
      ),
    );
  }
  if (withPhoneOnly) filters.push(isNotNull(contact.phone));

  const match = query
    ? or(
        ilike(contact.name, `%${query}%`),
        ilike(contact.phone, `%${query}%`),
        ilike(contact.email, `%${query}%`),
        // "knee talk" finds everyone who came in through that form or campaign.
        ilike(contact.campaign, `%${query}%`),
        ilike(sql`replace(${contact.source}, '_', ' ')`, `%${query}%`),
      )
    : undefined;
  if (match) filters.push(match);

  // When they last enquired: their newest lead form, or when they were added.
  // An earlier lead who fills a new form is a fresh enquiry and belongs at the
  // top, not under the date they first arrived.
  // Stored as UTC without a zone; sent as ISO with Z so a browser reads it right
  // (and ISO text sorts the same as the time it stands for).
  const enquiredTs = sql`greatest(${contact.createdAt}, (
    select max(ls.received_at) from lead_submission ls where ls.contact_id = "contact"."id"
  ))`;
  const enquiredAt = sql<string>`to_char(${enquiredTs}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

  // ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD — whole days in IST, both ends
  // included, on the same "last enquiry" date the list shows. Stored times
  // are UTC, so an IST midnight is 18:30 UTC the day before.
  const day = (key: string) => {
    const v = url.searchParams.get(key) ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
  };
  const dateFrom = day("dateFrom");
  const dateTo = day("dateTo");
  if (dateFrom) filters.push(sql`${enquiredTs} >= (${dateFrom}::date - interval '5 hours 30 minutes')`);
  if (dateTo) filters.push(sql`${enquiredTs} < (${dateTo}::date + interval '1 day' - interval '5 hours 30 minutes')`);

  return { filters, scope, sides, match, held, withPhoneOnly, enquiredAt };
}
