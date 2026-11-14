import { NextResponse } from "next/server";
import { clinicContext } from "@/src/lib/auth/clinic";

/** The clinics this person works in, and which one they are looking at. */
export async function GET() {
  const context = await clinicContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    active: { id: context.clinic.id, name: context.clinic.name, role: context.role },
    clinics: context.memberships.map((m) => ({
      id: m.clinic.id,
      name: m.clinic.name,
      slug: m.clinic.slug,
      city: m.clinic.city,
      role: m.role,
    })),
  });
}
