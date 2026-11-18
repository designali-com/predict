import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { clinic, leadRule } from "@workspace/db/schema";
import { asc, eq } from "@workspace/db";
import { canAccessClinic, cleanBrandColor, cleanReceiptPrefix, isSuperadmin, updateClinic } from "@workspace/db/clinic-service";
import { getAutomationSettings, updateAutomationSettings } from "@workspace/db/automation-settings";
import { CLINIC_PLACES } from "@workspace/db/india-geo";
import { isClinicModule } from "@workspace/db/clinic-modules";
import { requireClinicPermission } from "@/src/lib/auth/clinic";

/**
 * One clinic's details and its configuration, for the clinic's own page.
 *
 * GET    the clinic, its automation settings (quiet hours, first response)
 *        and the lead-routing rules that send leads to it
 * PATCH  { details?: {...}, settings?: {...} }. Opening or closing a clinic
 *        is superadmin only; the rest is anyone with Clinics who works there.
 */

const DETAIL_FIELDS = [
  "name",
  "city",
  "state",
  "addressLine1",
  "addressLine2",
  "pincode",
  "phone",
  "email",
  "gstin",
  "registrationNo",
  "footerNote",
  "timezone",
  "shortName",
  "legalName",
  "website",
] as const;

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "UTC"];

async function guard(id: string) {
  const context = await requireClinicPermission("ops.clinics");
  if (!context) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await canAccessClinic(db, context.session.user, id))) {
    return { error: NextResponse.json({ error: "Not your clinic" }, { status: 403 }) };
  }
  return { context };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, error } = await guard(id);
  if (error) return error;

  const row = await db.query.clinic.findFirst({ where: eq(clinic.id, id) });
  if (!row) return NextResponse.json({ error: "No such clinic" }, { status: 404 });

  const [settings, rules] = await Promise.all([
    getAutomationSettings(db, id),
    db
      .select({ id: leadRule.id, kind: leadRule.kind, name: leadRule.name, active: leadRule.active, hubLabel: leadRule.hubLabel, assignRole: leadRule.assignRole })
      .from(leadRule)
      .where(eq(leadRule.clinicId, id))
      .orderBy(asc(leadRule.priority)),
  ]);

  return NextResponse.json({
    clinic: row,
    settings,
    leadRules: rules,
    timezones: TIMEZONES,
    places: CLINIC_PLACES.map((p) => p.label),
    canOpenClose: isSuperadmin(context!.session.user.role),
    isActiveClinic: context!.clinic.id === id,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, error } = await guard(id);
  if (error) return error;

  const body = ((await req.json().catch(() => null)) ?? {}) as {
    details?: Record<string, unknown>;
    settings?: Record<string, unknown>;
  };

  if (body.details) {
    const d = body.details;
    const patch: Record<string, unknown> = {};
    for (const field of DETAIL_FIELDS) {
      if (d[field] === undefined) continue;
      if (d[field] !== null && typeof d[field] !== "string") {
        return NextResponse.json({ error: `${field} must be text` }, { status: 400 });
      }
      const value = typeof d[field] === "string" ? (d[field] as string).trim() : null;
      patch[field] = value || null;
    }
    if ("name" in patch && !patch.name) return NextResponse.json({ error: "The clinic needs a name" }, { status: 400 });
    if ("timezone" in patch && !TIMEZONES.includes(String(patch.timezone))) {
      return NextResponse.json({ error: "Pick a timezone from the list" }, { status: 400 });
    }
    // Coordinates follow the city, from our own list — they decide which
    // clinic a far-away lead is routed to, so they are never typed in.
    if (typeof patch.city === "string") {
      const place = CLINIC_PLACES.find((p) => p.label === patch.city);
      if (place) Object.assign(patch, { latitude: place.lat, longitude: place.lng });
    }
    // Its brand. The prefix starts every receipt number from here on.
    if (d.brandColor !== undefined) {
      const color = d.brandColor ? cleanBrandColor(d.brandColor) : null;
      if (d.brandColor && !color) return NextResponse.json({ error: "Give the colour as #rrggbb" }, { status: 400 });
      patch.brandColor = color;
    }
    if (d.receiptPrefix !== undefined) {
      const prefix = cleanReceiptPrefix(d.receiptPrefix);
      if (!prefix) return NextResponse.json({ error: "Receipt prefix is 2 to 8 letters or digits, like OPTM" }, { status: 400 });
      patch.receiptPrefix = prefix;
    }
    // What it uses of the panel — what the clinic has bought, so superadmin only.
    if (d.modules !== undefined) {
      if (!isSuperadmin(context!.session.user.role)) {
        return NextResponse.json({ error: "Only a superadmin can change a clinic's modules" }, { status: 403 });
      }
      if (!Array.isArray(d.modules) || !d.modules.every(isClinicModule)) {
        return NextResponse.json({ error: "Unknown module" }, { status: 400 });
      }
      patch.modules = [...new Set(d.modules)];
    }
    // One of ours, or a partner hospital (Apollo): decides whether its doctors
    // are walled off to its own patients. Superadmin only, like opening one.
    if (d.kind !== undefined) {
      if (!isSuperadmin(context!.session.user.role)) {
        return NextResponse.json({ error: "Only a superadmin can change what kind of clinic this is" }, { status: 403 });
      }
      if (d.kind !== "clinic" && d.kind !== "partner") {
        return NextResponse.json({ error: "Kind is clinic or partner" }, { status: 400 });
      }
      patch.kind = d.kind;
    }
    if (d.isActive !== undefined) {
      if (!isSuperadmin(context!.session.user.role)) {
        return NextResponse.json({ error: "Only a superadmin can open or close a clinic" }, { status: 403 });
      }
      if (d.isActive === false && context!.clinic.id === id) {
        return NextResponse.json({ error: "Switch to another clinic before closing the one you are in" }, { status: 400 });
      }
      patch.isActive = Boolean(d.isActive);
    }
    if (Object.keys(patch).length) await updateClinic(db, id, patch as Parameters<typeof updateClinic>[2]);
  }

  if (body.settings) {
    const s = body.settings;
    const current = await getAutomationSettings(db, id);
    const hour = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
    };
    await updateAutomationSettings(db, current.id, {
      ...(typeof s.quietHoursEnabled === "boolean" ? { quietHoursEnabled: s.quietHoursEnabled } : {}),
      ...(s.quietStartHour !== undefined ? { quietStartHour: hour(s.quietStartHour, current.quietStartHour) } : {}),
      ...(s.quietEndHour !== undefined ? { quietEndHour: hour(s.quietEndHour, current.quietEndHour) } : {}),
      ...(typeof s.timezone === "string" && TIMEZONES.includes(s.timezone) ? { timezone: s.timezone } : {}),
      ...(s.firstResponseMinutes !== undefined && Number(s.firstResponseMinutes) >= 5 && Number(s.firstResponseMinutes) <= 1440
        ? { firstResponseMinutes: Math.round(Number(s.firstResponseMinutes)) }
        : {}),
      ...(typeof s.callbackReminders === "boolean" ? { callbackReminders: s.callbackReminders } : {}),
    });
  }

  const row = await db.query.clinic.findFirst({ where: eq(clinic.id, id) });
  return NextResponse.json({ clinic: row, settings: await getAutomationSettings(db, id) });
}
