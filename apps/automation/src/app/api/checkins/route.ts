import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationTemplate } from "@workspace/db/schema";
import { inArray, sql } from "@workspace/db";
import { CHECKINS, CHECKIN_KINDS, checkinOption, isCheckinKind, istDate } from "@workspace/db/checkin";
import { getCheckinSettings, saveCheckinSetting } from "@workspace/db/checkin-settings";
import { requirePermission } from "@/src/lib/auth/guards";
import { dueFor } from "@/src/checkins";

/**
 * The daily check-ins (medicine, exercise, diet) for the Automations page.
 *
 * GET    each kind: on/off and send time, its template's approval, who is due
 *        to be asked about yesterday, what went out and what came back
 * PATCH  { kind, enabled, hour, minute }
 */
export async function GET() {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const day = istDate(new Date(), -1);
  const [settings, templates, due, sentRows, answerRows] = await Promise.all([
    getCheckinSettings(db),
    db
      .select({ key: communicationTemplate.key, status: communicationTemplate.submissionStatus })
      .from(communicationTemplate)
      .where(inArray(communicationTemplate.key, CHECKIN_KINDS.map((k) => CHECKINS[k].template))),
    dueFor(day),
    db.execute(sql`
      select split_part(idempotency_key, ':', 2) as kind, status, count(*)::int as n
      from communication_message
      where idempotency_key like 'checkin:%' and idempotency_key like ${"%:" + day}
      group by 1, 2
    `),
    db.execute(sql`
      select kind, response, count(*)::int as n from checkin_log where for_date = ${day} group by 1, 2
    `),
  ]);
  const templateStatus = new Map(templates.map((t) => [t.key, t.status]));

  const checkins = CHECKIN_KINDS.map((kind) => {
    const sent = (sentRows.rows as { kind: string; status: string; n: number }[]).filter((r) => r.kind === kind);
    const answers = (answerRows.rows as { kind: string; response: string; n: number }[]).filter((r) => r.kind === kind);
    const score = (s: string) => answers.filter((a) => checkinOption(kind, a.response)?.score === s).reduce((t, a) => t + a.n, 0);
    const count = (...statuses: string[]) => sent.filter((r) => statuses.includes(r.status)).reduce((t, r) => t + r.n, 0);
    return {
      kind,
      label: CHECKINS[kind].label,
      template: CHECKINS[kind].template,
      templateStatus: templateStatus.get(CHECKINS[kind].template) ?? "missing",
      buttons: CHECKINS[kind].options.map((o) => o.button),
      enabled: settings[kind].enabled,
      hour: settings[kind].hour,
      minute: settings[kind].minute,
      day,
      due: due[kind].size,
      sent: count("sent", "delivered", "read", "failed"),
      delivered: count("delivered", "read"),
      failed: count("failed"),
      answered: { done: score("done"), partial: score("partial"), missed: score("missed") },
    };
  });
  return NextResponse.json({ checkins });
}

export async function PATCH(req: Request) {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { kind?: string; enabled?: boolean; hour?: number; minute?: number } | null;
  if (!isCheckinKind(body?.kind)) return NextResponse.json({ error: "Unknown check-in" }, { status: 400 });
  const current = (await getCheckinSettings(db))[body.kind];
  await saveCheckinSetting(
    db,
    {
      kind: body.kind,
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      hour: Number.isFinite(body.hour) ? Number(body.hour) : current.hour,
      minute: Number.isFinite(body.minute) ? Number(body.minute) : current.minute,
    },
    session.user.id,
  );
  return NextResponse.json({ ok: true });
}
