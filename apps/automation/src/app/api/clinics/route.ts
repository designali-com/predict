import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { cleanReceiptPrefix, createClinic, isSuperadmin, listClinics } from "@workspace/db/clinic-service";
import { interestKey } from "@workspace/db/lead-rule-fields";
import { CLINIC_PLACES } from "@workspace/db/india-geo";
import { clinicContext } from "@/src/lib/auth/clinic";

/** The clinics this person can work in, and which one they are in now. */
export async function GET() {
  const context = await clinicContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    active: { id: context.clinic.id, name: context.clinic.name, slug: context.clinic.slug, role: context.role },
    clinics: context.memberships.map((m) => ({
      id: m.clinic.id,
      name: m.clinic.name,
      slug: m.clinic.slug,
      city: m.clinic.city,
      role: m.role,
    })),
    canCreate: isSuperadmin(context.session.user.role),
    places: CLINIC_PLACES.map((p) => p.label),
  });
}

/**
 * Opens a new clinic. Superadmin only: a clinic is not a record inside the
 * business, it *is* a business — and whoever opens one sees everything in it.
 */
export async function POST(req: Request) {
  const context = await clinicContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperadmin(context.session.user.role)) {
    return NextResponse.json({ error: "Only a superadmin can open a clinic" }, { status: 403 });
  }

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Give the clinic a name" }, { status: 400 });

  // Every receipt the clinic prints starts with this, so it is asked for up front.
  const receiptPrefix = cleanReceiptPrefix(b.receiptPrefix);
  if (!receiptPrefix) return NextResponse.json({ error: "Give a receipt prefix: 2 to 8 letters or digits, like OPTM" }, { status: 400 });

  const slug = interestKey(typeof b.slug === "string" && b.slug ? b.slug : name).replace(/_/g, "-");
  const existing = await listClinics(db, true);
  if (existing.some((c) => c.slug === slug)) {
    return NextResponse.json({ error: `"${slug}" is already taken` }, { status: 400 });
  }

  // Coordinates come from our own city list, never typed in: they decide
  // which clinic a far-away lead is routed to.
  const place = typeof b.city === "string" ? CLINIC_PLACES.find((p) => p.label === b.city) : undefined;

  const clinic = await createClinic(db, {
    name,
    slug,
    shortName: typeof b.shortName === "string" && b.shortName.trim() ? b.shortName.trim() : null,
    receiptPrefix,
    city: place?.label ?? (typeof b.city === "string" ? b.city : null),
    state: typeof b.state === "string" ? b.state : null,
    addressLine1: typeof b.addressLine1 === "string" ? b.addressLine1 : null,
    pincode: typeof b.pincode === "string" ? b.pincode : null,
    phone: typeof b.phone === "string" ? b.phone : null,
    email: typeof b.email === "string" ? b.email : null,
    gstin: typeof b.gstin === "string" ? b.gstin : null,
    latitude: place?.lat ?? null,
    longitude: place?.lng ?? null,
    // A partner hospital (Apollo) — its doctors see only its own patients.
    kind: b.kind === "partner" ? "partner" : "clinic",
  });

  return NextResponse.json({ clinic });
}
