import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  getAutomationSettings,
  heartbeats,
  isQuietHour,
  nextOpenTime,
  updateAutomationSettings,
} from "@workspace/db/automation-settings";
import { requireClinicPermission } from "@/src/lib/auth/clinic";

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "UTC"];

export async function GET() {
  const context = await requireClinicPermission("ops.automation_settings");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getAutomationSettings(db, context.clinic.id);
  const quiet = isQuietHour(settings);
  return NextResponse.json({
    settings,
    timezones: TIMEZONES,
    // What the rules mean right now, so the page can say "messages are
    // waiting until 9am" instead of leaving it to be worked out.
    now: {
      quiet,
      resumesAt: quiet ? nextOpenTime(settings)?.toISOString() ?? null : null,
    },
    health: await heartbeats(db),
    clinic: { id: context.clinic.id, name: context.clinic.name },
  });
}

export async function PATCH(req: Request) {
  const context = await requireClinicPermission("ops.automation_settings");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const existing = await getAutomationSettings(db, context.clinic.id);
  const hour = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
  };
  const email = typeof b.managerEmail === "string" ? b.managerEmail.trim() : existing.managerEmail ?? "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That manager email does not look right" }, { status: 400 });
  }

  const settings = await updateAutomationSettings(db, existing.id, {
    quietHoursEnabled: typeof b.quietHoursEnabled === "boolean" ? b.quietHoursEnabled : existing.quietHoursEnabled,
    quietStartHour: hour(b.quietStartHour, existing.quietStartHour),
    quietEndHour: hour(b.quietEndHour, existing.quietEndHour),
    timezone: TIMEZONES.includes(String(b.timezone)) ? String(b.timezone) : existing.timezone,
    firstResponseMinutes: Number.isFinite(Number(b.firstResponseMinutes))
      ? Math.min(1440, Math.max(0, Math.round(Number(b.firstResponseMinutes))))
      : existing.firstResponseMinutes,
    callbackReminders:
      typeof b.callbackReminders === "boolean" ? b.callbackReminders : existing.callbackReminders,
    notifyAssignee: typeof b.notifyAssignee === "boolean" ? b.notifyAssignee : existing.notifyAssignee,
    managerEmail: email || null,
  });

  return NextResponse.json({ settings });
}
