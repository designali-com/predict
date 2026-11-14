import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, clinicChannel, clinicMember, contact } from "@workspace/db/schema";
import { and, count, eq, gte, inArray, sql } from "@workspace/db";
import { isSuperadmin, listClinics } from "@workspace/db/clinic-service";
import { CLINIC_PLACES } from "@workspace/db/india-geo";
import { clinicContext } from "@/src/lib/auth/clinic";

/**
 * The Clinics list: every clinic this person can see, with enough numbers on
 * each card to tell them apart at a glance.
 *
 * A superadmin sees every clinic, closed ones included; anyone else sees the
 * clinics they are a member of.
 */
export async function GET() {
  const context = await clinicContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const superadmin = isSuperadmin(context.session.user.role);
  const visible = superadmin
    ? await listClinics(db, true)
    : context.memberships.map((m) => m.clinic);
  const ids = visible.map((c) => c.id);
  if (!ids.length) {
    return NextResponse.json({ clinics: [], activeId: context.clinic.id, canCreate: superadmin, places: [] });
  }

  const [staff, people, upcoming, numbers] = await Promise.all([
    db
      .select({ clinicId: clinicMember.clinicId, n: count() })
      .from(clinicMember)
      .where(and(inArray(clinicMember.clinicId, ids), eq(clinicMember.isActive, true)))
      .groupBy(clinicMember.clinicId),
    db
      .select({
        clinicId: contact.clinicId,
        leads: sql<number>`count(*) filter (where ${contact.stage} in ('LEAD','BOOKED'))::int`,
        patients: sql<number>`count(*) filter (where ${contact.stage} in ('PATIENT','INACTIVE'))::int`,
      })
      .from(contact)
      .where(inArray(contact.clinicId, ids))
      .groupBy(contact.clinicId),
    db
      .select({ clinicId: appointment.clinicId, n: count() })
      .from(appointment)
      .where(
        and(
          inArray(appointment.clinicId, ids),
          gte(appointment.scheduledAt, new Date()),
          inArray(appointment.status, ["scheduled", "confirmed"]),
        ),
      )
      .groupBy(appointment.clinicId),
    db
      .select({ clinicId: clinicChannel.clinicId, displayNumber: clinicChannel.displayNumber, phoneNumberId: clinicChannel.phoneNumberId })
      .from(clinicChannel)
      .where(and(inArray(clinicChannel.clinicId, ids), eq(clinicChannel.isActive, true))),
  ]);

  const roleHere = new Map(context.memberships.map((m) => [m.clinic.id, m.role]));

  return NextResponse.json({
    activeId: context.clinic.id,
    canCreate: superadmin,
    places: CLINIC_PLACES.map((p) => p.label),
    clinics: visible.map((c) => {
      const p = people.find((r) => r.clinicId === c.id);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        city: c.city,
        state: c.state,
        phone: c.phone,
        isActive: c.isActive,
        kind: c.kind,
        role: superadmin ? "superadmin" : (roleHere.get(c.id) ?? null),
        staff: staff.find((r) => r.clinicId === c.id)?.n ?? 0,
        leads: p?.leads ?? 0,
        patients: p?.patients ?? 0,
        upcoming: upcoming.find((r) => r.clinicId === c.id)?.n ?? 0,
        whatsapp: numbers.filter((n) => n.clinicId === c.id).map((n) => n.displayNumber ?? n.phoneNumberId),
      };
    }),
  });
}
