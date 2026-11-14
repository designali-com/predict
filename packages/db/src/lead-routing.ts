import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { clinicMember, contact, leadRule, user } from "./schema";
import type * as schema from "./schema";
import { emitDomainEvent } from "./emit-domain-event";
import { DomainEventType } from "./domain-events";
import { interestKey } from "./lead-rule-fields";
import { distanceKm, locateLead, type GeoPoint } from "./india-geo";
import { defaultClinicId } from "./clinic-service";

export { MATCH_FIELDS, interestKey } from "./lead-rule-fields";

type Db = NodePgDatabase<typeof schema>;

// Decides, for a new lead, who works it and which ICP it belongs to — from
// the rules in Setup -> Lead routing (the lead_rule table), not from code.
//
// Who gets it, in this order:
//   1. a rule with keywords but no clinic location that matches — special
//      campaigns routed to particular people
//   2. the rule whose clinic is nearest to where the lead is — a Mumbai lead
//      goes to Delhi, a Patna lead to Kolkata
//   3. location unknown: a clinic rule whose keywords match, else the first
//      rule without keywords
//
// Which ICP: the first ICP rule whose code or keywords appear in the ad set,
// campaign, ad, form or answers.

/** What a rule can match against. Everything is optional — use what the lead has. */
export interface LeadFacts {
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  adsetName?: string | null;
  campaignName?: string | null;
  adName?: string | null;
  /** Provider ad id — what "Map to ICP" in Lead routing adds as a keyword. */
  adId?: string | null;
  formName?: string | null;
  source?: string | null;
  platform?: string | null;
  answers?: Record<string, string>;
}

export type LeadRuleRow = typeof leadRule.$inferSelect;

function haystack(field: string, f: LeadFacts): string {
  const answers = Object.entries(f.answers ?? {})
    .map(([k, v]) => `${k} ${v}`)
    .join(" ");
  switch (field) {
    case "city":
      // A city is often only in the answers ("Which city are you in?") or in
      // the ad set name ("Delhi | Knee pain | 30-55") — look in all of them.
      return [f.city, f.state, f.pincode, f.adsetName, f.campaignName].filter(Boolean).join(" ");
    case "adset":
      return f.adsetName ?? "";
    case "campaign":
      return f.campaignName ?? "";
    case "ad":
      return [f.adName, f.adId].filter(Boolean).join(" ");
    case "form":
      return f.formName ?? "";
    case "answers":
      return answers;
    case "source":
      return [f.source, f.platform].filter(Boolean).join(" ");
    default:
      return [f.city, f.state, f.adsetName, f.campaignName, f.adName, f.adId, f.formName, answers].filter(Boolean).join(" ");
  }
}

/**
 * Keywords in a rule, comma separated. An ICP rule also always matches its
 * own code in any spelling — knee_pain, "knee pain", knee-pain, KNEEPAIN —
 * so naming an ad "Delhi | knee_pain | v3" maps it with no keywords at all.
 */
export function ruleKeywords(rule: Pick<LeadRuleRow, "matchValues" | "interest">): string[] {
  const listed = rule.matchValues
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (!rule.interest) return listed;
  const code = rule.interest.toLowerCase();
  return [...new Set([...listed, code, code.replace(/_/g, " "), code.replace(/_/g, "-"), code.replace(/_/g, "")])];
}

export function ruleMatches(
  rule: Pick<LeadRuleRow, "matchField" | "matchValues" | "interest">,
  facts: LeadFacts,
): boolean {
  const keywords = ruleKeywords(rule);
  if (keywords.length === 0) return true;
  const text = haystack(rule.matchField, facts).toLowerCase();
  return keywords.some((k) => text.includes(k));
}

async function activeRules(db: Db, kind: "assign" | "interest") {
  return db
    .select()
    .from(leadRule)
    .where(and(eq(leadRule.kind, kind), eq(leadRule.active, true)))
    .orderBy(asc(leadRule.priority), asc(leadRule.createdAt));
}

export type RoutedBy = "keyword" | "nearest" | "default";

export interface AssignDecision {
  rule: LeadRuleRow;
  routedBy: RoutedBy;
  location: (GeoPoint & { from: string }) | null;
  distanceKm: number | null;
}

/** Where the lead is, from everything the lead carries. */
export function leadLocation(f: LeadFacts) {
  return locateLead({
    city: f.city,
    state: f.state,
    pincode: f.pincode,
    otherText: [f.adsetName, f.campaignName, f.formName],
  });
}

/** Which assignment rule a lead falls under, and why. Pure: writes nothing. */
export function chooseAssignRule(rules: LeadRuleRow[], facts: LeadFacts): AssignDecision | null {
  const location = leadLocation(facts);
  const isHub = (r: LeadRuleRow) => r.hubLat != null && r.hubLng != null;
  const hasKeywords = (r: LeadRuleRow) => ruleKeywords(r).length > 0;

  // Special cases first: a keyword rule with no clinic ("corporate" campaign
  // -> one person) is about the ad, not the place.
  const special = rules.find((r) => !isHub(r) && hasKeywords(r) && ruleMatches(r, facts));
  if (special) return { rule: special, routedBy: "keyword", location, distanceKm: null };

  // Then distance. Where the person is beats which ad they clicked: someone
  // in Mumbai who saw the Kolkata ad still belongs to the nearer clinic.
  const hubs = rules.filter(isHub);
  if (location && hubs.length) {
    let best: { rule: LeadRuleRow; km: number } | null = null;
    for (const rule of hubs) {
      const km = distanceKm(location, { lat: rule.hubLat!, lng: rule.hubLng! });
      if (!best || km < best.km) best = { rule, km };
    }
    if (best) return { rule: best.rule, routedBy: "nearest", location, distanceKm: Math.round(best.km) };
  }

  // Location unknown: a clinic rule's own keywords, then the default.
  const byKeyword = rules.find((r) => hasKeywords(r) && ruleMatches(r, facts));
  if (byKeyword) return { rule: byKeyword, routedBy: "keyword", location, distanceKm: null };

  const fallback = rules.find((r) => ruleKeywords(r).length === 0);
  return fallback ? { rule: fallback, routedBy: "default", location, distanceKm: null } : null;
}

/** What would happen to a lead like this, without writing anything — for the tester. */
export async function previewRouting(db: Db, facts: LeadFacts) {
  const [assign, interest] = await Promise.all([activeRules(db, "assign"), activeRules(db, "interest")]);
  return {
    assign: chooseAssignRule(assign, facts),
    interestRule: interest.find((r) => ruleMatches(r, facts)) ?? null,
    location: leadLocation(facts),
  };
}

/**
 * The people a rule hands leads to, in a stable order: the rule's named
 * people if it has any, else everyone holding its role. Banned accounts are
 * skipped so a leaver stops receiving leads the moment they are disabled.
 * (banned is nullable in the live table — NULL means not banned.)
 */
async function candidates(db: Db, rule: LeadRuleRow): Promise<{ id: string; name: string }[]> {
  const notBanned = sql`coalesce(${user.banned}, false) = false`;
  const named = (rule.assignUserIds ?? []).filter(Boolean);
  if (named.length) {
    const rows = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(inArray(user.id, named), notBanned));
    // Keep the order the admin listed them in.
    return named.map((id) => rows.find((r) => r.id === id)).filter((r): r is { id: string; name: string } => !!r);
  }
  if (!rule.assignRole) return [];
  // A clinic's rule shares its leads only among that clinic's own people with
  // the role — "every telecaller" means Delhi's telecallers for the Delhi
  // rule, not Kolkata's too. The role is the one they hold at that clinic.
  if (rule.clinicId) {
    return db
      .select({ id: user.id, name: user.name })
      .from(clinicMember)
      .innerJoin(user, eq(user.id, clinicMember.userId))
      .where(
        and(
          eq(clinicMember.clinicId, rule.clinicId),
          eq(clinicMember.role, rule.assignRole),
          eq(clinicMember.isActive, true),
          notBanned,
        ),
      )
      .orderBy(asc(user.createdAt), asc(user.id));
  }
  // A rule with no clinic: anyone holding the role, as before.
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.role, rule.assignRole), notBanned))
    .orderBy(asc(user.createdAt), asc(user.id));
}

export interface RoutingResult {
  /** The clinic this lead now belongs to. */
  clinicId: string | null;
  interest: string | null;
  city: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedRole: string | null;
  ruleName: string | null;
  routedBy: RoutedBy | null;
  distanceKm: number | null;
}

/**
 * Routes one contact. Only fills gaps: a contact who already has an owner or
 * an ICP keeps them — a second form from the same person must not move them
 * away from the caller already talking to them.
 */
export async function routeLead(db: Db, contactId: string, facts: LeadFacts): Promise<RoutingResult> {
  const [row] = await db.select().from(contact).where(eq(contact.id, contactId)).limit(1);
  if (!row) throw new Error(`routeLead: contact ${contactId} not found`);

  const patch: Partial<typeof contact.$inferInsert> = {};
  const result: RoutingResult = {
    clinicId: row.clinicId,
    interest: row.interest,
    city: row.city,
    assignedUserId: row.assignedUserId,
    assignedUserName: null,
    assignedRole: row.assignedRole,
    ruleName: null,
    routedBy: null,
    distanceKm: null,
  };

  if (!row.city) {
    // What they typed, else the place we worked out (PIN code, state, ad set).
    const city = facts.city?.trim() || leadLocation(facts)?.label || null;
    if (city) {
      patch.city = city;
      result.city = city;
    }
  }

  if (!row.interest) {
    const rule = (await activeRules(db, "interest")).find((r) => ruleMatches(r, facts));
    if (rule?.interest) {
      patch.interest = interestKey(rule.interest);
      result.interest = patch.interest;
    }
  }

  let assigned = false;
  if (!row.assignedUserId && !row.assignedRole) {
    const decision = chooseAssignRule(await activeRules(db, "assign"), facts);
    if (decision) {
      const { rule } = decision;
      const people = await candidates(db, rule);
      let person: { id: string; name: string } | undefined;
      if (people.length) {
        // Atomic, so two leads arriving together do not both read cursor 4
        // and land on the same person.
        const [bumped] = await db
          .update(leadRule)
          .set({ rrCursor: sql`${leadRule.rrCursor} + 1` })
          .where(eq(leadRule.id, rule.id))
          .returning({ cursor: leadRule.rrCursor });
        person = people[((bumped?.cursor ?? 1) - 1) % people.length];
      }
      patch.assignedUserId = person?.id ?? null;
      patch.assignedRole = rule.assignRole ?? null;
      patch.assignedAt = new Date();
      // The rule that claimed the lead also says which clinic it belongs to.
      // Nearest-clinic routing and tenancy are the same decision, made once.
      if (!row.clinicId && rule.clinicId) {
        patch.clinicId = rule.clinicId;
        result.clinicId = rule.clinicId;
      }
      Object.assign(result, {
        assignedUserId: person?.id ?? null,
        assignedUserName: person?.name ?? null,
        assignedRole: rule.assignRole ?? null,
        ruleName: rule.name,
        routedBy: decision.routedBy,
        distanceKm: decision.distanceKm,
      });
      assigned = true;
    }
  }

  // No rule matched, or the rule predates clinics: the lead still has to
  // live somewhere, and an unassigned lead in no clinic is invisible to
  // everyone.
  if (!result.clinicId) {
    const fallback = await defaultClinicId(db);
    if (fallback) {
      patch.clinicId = fallback;
      result.clinicId = fallback;
    }
  }

  if (Object.keys(patch).length) {
    await db.update(contact).set(patch).where(eq(contact.id, contactId));
  }

  if (assigned) {
    await emitDomainEvent(
      db,
      DomainEventType.LEAD_ASSIGNED,
      {
        contactId,
        assignedUserId: result.assignedUserId,
        assignedUserName: result.assignedUserName,
        assignedRole: result.assignedRole,
        rule: result.ruleName,
        clinicId: result.clinicId,
        routedBy: result.routedBy,
        distanceKm: result.distanceKm,
        interest: result.interest,
        city: result.city,
      },
      { contactId, idempotencyKey: `lead_assigned:auto:${contactId}` },
    );
  }

  return result;
}
