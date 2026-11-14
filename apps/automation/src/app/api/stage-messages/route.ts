import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { automationFlow, communicationTemplate, contact, stageMessageSend, user } from "@workspace/db/schema";
import { and, desc, eq, inArray } from "@workspace/db";
import {
  VARIABLE_LABELS,
  listDoctorTemplates,
  listStageRules,
  setStageMessagesPaused,
  stageMessagesPaused,
} from "@workspace/db/stage-messages";
import { requirePermission } from "@/src/lib/auth/guards";

/**
 * The Stage Messages page's data.
 *
 * GET    every moment with its rule, the WhatsApp templates to choose from,
 *        the active flows on the same event (so the page can warn of a
 *        double message), and the latest sends
 * PATCH  { paused } — the switch over all of them
 */

type Button = { type?: string; url?: string };

export async function GET() {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [moments, paused, templates, flows, overrides, clinicians] = await Promise.all([
    listStageRules(db),
    stageMessagesPaused(db),
    db
      .select({
        key: communicationTemplate.key,
        name: communicationTemplate.name,
        status: communicationTemplate.submissionStatus,
        category: communicationTemplate.wabaCategory,
        bodyText: communicationTemplate.bodyText,
        headerType: communicationTemplate.headerType,
        variables: communicationTemplate.variablesSchema,
        buttons: communicationTemplate.ctaButtons,
      })
      .from(communicationTemplate)
      .where(eq(communicationTemplate.channel, "whatsapp"))
      .orderBy(communicationTemplate.name),
    db
      .select({ id: automationFlow.id, name: automationFlow.name, trigger: automationFlow.triggerEventType })
      .from(automationFlow)
      .where(eq(automationFlow.status, "active")),
    listDoctorTemplates(db),
    db
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .where(and(eq(user.banned, false), inArray(user.role, ["doctor", "nutritionist"])))
      .orderBy(user.name),
  ]);

  const ruleIds = moments.map((m) => m.rule?.id).filter((id): id is string => Boolean(id));
  const recent = ruleIds.length
    ? await db
        .select({
          ruleId: stageMessageSend.ruleId,
          status: stageMessageSend.status,
          detail: stageMessageSend.detail,
          templateKey: stageMessageSend.templateKey,
          createdAt: stageMessageSend.createdAt,
          sendAt: stageMessageSend.sendAt,
          sentAt: stageMessageSend.sentAt,
          contactName: contact.name,
        })
        .from(stageMessageSend)
        .leftJoin(contact, eq(contact.id, stageMessageSend.contactId))
        .where(inArray(stageMessageSend.ruleId, ruleIds))
        .orderBy(desc(stageMessageSend.createdAt))
        .limit(60)
    : [];

  return NextResponse.json({
    paused,
    variableLabels: VARIABLE_LABELS,
    moments: moments.map(({ trigger, rule }) => ({
      ...trigger,
      rule,
      flows: flows.filter((f) => f.trigger === trigger.eventType).map((f) => ({ id: f.id, name: f.name })),
      recent: rule ? recent.filter((r) => r.ruleId === rule.id).slice(0, 8) : [],
      overrides: overrides
        .filter((o) => o.triggerKey === trigger.key)
        .map((o) => ({
          doctorUserId: o.doctorUserId,
          doctorName: o.doctorName,
          templateKey: o.templateKey,
        })),
    })),
    doctors: clinicians.map((c) => ({
      id: c.id,
      name: c.name,
      role: (c.role ?? "").toLowerCase(),
    })),
    templates: templates.map((t) => {
      const buttons = (Array.isArray(t.buttons) ? t.buttons : []) as Button[];
      return {
        key: t.key,
        name: t.name,
        status: t.status,
        category: t.category,
        bodyText: t.bodyText,
        headerType: t.headerType,
        variables: Array.isArray(t.variables) ? (t.variables as unknown[]).filter((v) => typeof v === "string") : [],
        buttons: buttons.map((b) => ({ type: b.type ?? "", url: b.url ?? null })),
        // A link button ending in a variable needs a value per message, which
        // stage messages cannot supply yet.
        needsLinkValue: buttons.some((b) => b.type === "URL" && (b.url ?? "").includes("{{")),
      };
    }),
  });
}

export async function PATCH(req: Request) {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { paused?: unknown } | null;
  if (typeof body?.paused !== "boolean") {
    return NextResponse.json({ error: "paused must be true or false" }, { status: 400 });
  }
  await setStageMessagesPaused(db, body.paused, session.user.id);
  return NextResponse.json({ paused: body.paused });
}

