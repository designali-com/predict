import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationTemplate, contact } from "@workspace/db/schema";
import { and, eq, inArray } from "@workspace/db";
import { grantedPermissions } from "@workspace/db/permission-service";
import { sidesFor, stagesForSides } from "@workspace/db/contact-side";
import { sendCommunication } from "@workspace/communication";
import { requireAnyPermission } from "@/src/lib/auth/guards";

// The client sends one batch per request and shows progress across them, so
// a 400-person broadcast never depends on a single long-running function.
const MAX_PER_REQUEST = 100;
// Sends run a few at a time: sequential is needlessly slow for a few hundred
// contacts, and unbounded parallelism trips the Cloud API rate limit.
const CONCURRENCY = 5;

/** How one template variable gets its value for each recipient. */
interface VariableBinding {
  /** "contactField" pulls from the contact row; "literal" is the same for everyone. */
  source: "contactField" | "literal";
  /** Field name for contactField ("name" | "phone" | "email"), or the text for literal. */
  value: string;
  /** Used when a contactField is empty — without it that recipient is skipped. */
  fallback?: string;
}

type ContactRow = typeof contact.$inferSelect;

const CONTACT_FIELDS = ["name", "phone", "email"] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];

function isContactField(value: string): value is ContactField {
  return (CONTACT_FIELDS as readonly string[]).includes(value);
}

function resolveVariables(
  names: string[],
  bindings: Record<string, VariableBinding>,
  row: ContactRow,
): { ok: true; variables: Record<string, string> } | { ok: false; missing: string } {
  const variables: Record<string, string> = {};

  for (const name of names) {
    const binding = bindings[name];
    let value = "";

    if (binding?.source === "literal") {
      value = binding.value ?? "";
    } else if (binding?.source === "contactField" && isContactField(binding.value)) {
      value = row[binding.value] ?? "";
    }

    if (!value) value = binding?.fallback ?? "";

    // WhatsApp rejects a template send with an empty parameter, and the Graph
    // API error for it is opaque. Naming the variable here is the difference
    // between a fixable message and a mystery failure.
    if (!value) return { ok: false, missing: name };

    variables[name] = value;
  }

  return { ok: true, variables };
}

/** Runs `worker` over `items` with at most `limit` in flight, preserving order. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!);
    }
  });

  await Promise.all(runners);
  return results;
}

export async function POST(req: Request) {
  // Either list can send a template — a nurture sequence and a recall message
  // are the same action against different people.
  const session = await requireAnyPermission(["ops.leads", "ops.patients"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const templateKey = typeof body?.templateKey === "string" ? body.templateKey : "";
  const broadcastId = typeof body?.broadcastId === "string" ? body.broadcastId : "";
  const contactIds: string[] = Array.isArray(body?.contactIds)
    ? body.contactIds.filter((id: unknown): id is string => typeof id === "string")
    : [];
  const bindings: Record<string, VariableBinding> =
    body?.variables && typeof body.variables === "object" ? body.variables : {};

  if (!templateKey) {
    return NextResponse.json({ error: "Pick a template to send" }, { status: 400 });
  }
  // The idempotency key is built from this, and it is what stops a
  // double-clicked Send from messaging everyone twice.
  if (!broadcastId) {
    return NextResponse.json({ error: "broadcastId is required" }, { status: 400 });
  }
  if (contactIds.length === 0) {
    return NextResponse.json({ error: "Select at least one lead" }, { status: 400 });
  }
  if (contactIds.length > MAX_PER_REQUEST) {
    return NextResponse.json(
      { error: `Send at most ${MAX_PER_REQUEST} contacts per request` },
      { status: 400 },
    );
  }

  const [template] = await db
    .select()
    .from(communicationTemplate)
    .where(eq(communicationTemplate.key, templateKey))
    .limit(1);
  if (!template) {
    return NextResponse.json({ error: `Unknown template "${templateKey}"` }, { status: 400 });
  }
  // Same gate as the single-message send path: an unapproved template fails
  // at Meta with an opaque error, so refuse it here where we can explain why.
  if (template.channel === "whatsapp" && template.submissionStatus !== "approved") {
    return NextResponse.json(
      { error: `"${template.name}" is ${template.submissionStatus}, not approved by WhatsApp yet` },
      { status: 400 },
    );
  }

  const variableNames = Array.isArray(template.variablesSchema)
    ? (template.variablesSchema as unknown[]).filter((n): n is string => typeof n === "string")
    : [];

  // Ids arrive from the client, so the send is bounded by the lists this
  // person holds rather than by what their page happened to show them.
  const visible = stagesForSides(sidesFor(await grantedPermissions(db, session.user)));
  const rows = await db
    .select()
    .from(contact)
    .where(and(inArray(contact.id, contactIds), inArray(contact.stage, visible)));
  const byId = new Map(rows.map((row) => [row.id, row]));

  const results = await pooled(contactIds, CONCURRENCY, async (contactId) => {
    const row = byId.get(contactId);
    if (!row) {
      return { contactId, status: "failed", error: "Contact not found" };
    }

    const resolved = resolveVariables(variableNames, bindings, row);
    if (!resolved.ok) {
      return {
        contactId,
        name: row.name,
        phone: row.phone,
        status: "skipped_missing_value",
        error: `No value for "${resolved.missing}"`,
      };
    }

    try {
      const result = await sendCommunication({
        contactId,
        templateKey,
        variables: resolved.variables,
        sentBy: session.user.id,
        // Stable per (broadcast, contact): a retried batch resolves to the
        // already-sent message instead of sending a second one.
        idempotencyKey: `broadcast:${broadcastId}:${contactId}`,
      });
      return { contactId, name: row.name, phone: row.phone, status: result.status };
    } catch (error) {
      return {
        contactId,
        name: row.name,
        phone: row.phone,
        status: "failed",
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  });

  return NextResponse.json({ results });
}
