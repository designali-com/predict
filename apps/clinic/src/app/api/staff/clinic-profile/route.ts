import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { can } from "@workspace/db/permission-service";
import { updateClinic } from "@workspace/db/clinic-service";
import { clinicLetterhead } from "@workspace/db/receipt";
import { clinicContext } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";

/**
 * The active clinic's own details, as they print on its receipts and forms.
 * Each clinic has its own; the logo and colours are set from the operations
 * console, where clinics are opened.
 */
export async function GET() {
  // Read wherever receipts are made; changed only from Settings.
  const context = await clinicContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allowed = (await can(db, context.principal, "clinic.settings")) || (await can(db, context.principal, "clinic.billing"));
  if (!allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ profile: await clinicLetterhead(db, context.clinic.id) });
}

const FIELDS = [
  "name",
  "legalName",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "pincode",
  "phone",
  "email",
  "website",
  "gstin",
  "registrationNo",
  "footerNote",
  "consentText",
] as const;

export async function PUT(req: Request) {
  const context = await clinicContext();
  if (!context || !(await can(db, context.principal, "clinic.settings"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  const patch: Record<string, string | null> = {};
  for (const field of FIELDS) {
    if (body?.[field] === undefined) continue;
    patch[field] = String(body[field] ?? "").trim() || null;
  }

  // The name is what prints at the top of the receipt, so it cannot be emptied
  // into a blank heading.
  if (patch.name === null) {
    return NextResponse.json({ error: "The clinic needs a name on its receipts." }, { status: 400 });
  }

  try {
    await updateClinic(db, context.clinic.id, patch);
    return NextResponse.json({ profile: await clinicLetterhead(db, context.clinic.id) });
  } catch (error) {
    return NextResponse.json(
      { error: describeError(error, "Could not save those details") },
      { status: 400 },
    );
  }
}
