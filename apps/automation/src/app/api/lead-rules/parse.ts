import { MATCH_FIELDS, interestKey } from "@workspace/db/lead-rule-fields";
import { CLINIC_PLACES } from "@workspace/db/india-geo";

export interface RuleValues {
  kind: "assign" | "interest";
  name: string;
  priority: number;
  active: boolean;
  matchField: string;
  matchValues: string;
  assignRole: string | null;
  assignUserIds: string[];
  interest: string | null;
  hubLabel: string | null;
  hubLat: number | null;
  hubLng: number | null;
}

/** Validates a rule from the editor. Shared by create and update. */
export function parseRule(body: unknown): { value: RuleValues } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = b.kind;
  if (kind !== "assign" && kind !== "interest") return { error: "kind must be assign or interest" };

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: kind === "interest" ? "Give the ICP a name" : "Give the rule a name" };

  const matchField = typeof b.matchField === "string" ? b.matchField : "any";
  if (!MATCH_FIELDS.some((f) => f.key === matchField)) return { error: "Unknown match field" };

  const matchValues = typeof b.matchValues === "string" ? b.matchValues.trim() : "";
  const priority = Number.isFinite(Number(b.priority)) ? Math.round(Number(b.priority)) : 100;
  const none = { hubLabel: null, hubLat: null, hubLng: null };

  if (kind === "assign") {
    const assignRole = typeof b.assignRole === "string" && b.assignRole ? b.assignRole : null;
    const assignUserIds = Array.isArray(b.assignUserIds)
      ? b.assignUserIds.filter((x): x is string => typeof x === "string" && !!x)
      : [];
    if (!assignRole && !assignUserIds.length) return { error: "Pick a role or at least one person" };

    // Coordinates come from our own list, never from the client — a typo'd
    // latitude would quietly send a whole region to the wrong clinic.
    let hub = none as Pick<RuleValues, "hubLabel" | "hubLat" | "hubLng">;
    if (typeof b.hubLabel === "string" && b.hubLabel) {
      const place = CLINIC_PLACES.find((p) => p.label === b.hubLabel);
      if (!place) return { error: `Unknown clinic city "${b.hubLabel}"` };
      hub = { hubLabel: place.label, hubLat: place.lat, hubLng: place.lng };
    }
    return {
      value: { kind, name, priority, active: b.active !== false, matchField, matchValues, assignRole, assignUserIds, interest: null, ...hub },
    };
  }

  // An ICP. Its code is what templates and ad names use; it matches itself,
  // so keywords are optional extras (other spellings, Hindi words).
  const interest = typeof b.interest === "string" ? interestKey(b.interest) : "";
  if (!interest) return { error: "Give the ICP a short code, e.g. knee_pain" };
  return {
    value: { kind, name, priority, active: b.active !== false, matchField, matchValues, assignRole: null, assignUserIds: [], interest, ...none },
  };
}
