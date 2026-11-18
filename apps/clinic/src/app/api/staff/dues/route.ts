import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { patientDues } from "@workspace/db/patient-dues";
import { requireClinicApiPermission } from "@/src/lib/auth/clinic";
import { guardPatient } from "@/src/lib/auth/patient-scope";

/** Everything one patient owes — course balance, medicine on credit, visit fees. */
export async function GET(req: Request) {
  const context = await requireClinicApiPermission("clinic.billing");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contactId = new URL(req.url).searchParams.get("contactId") ?? "";
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  const blocked = await guardPatient(contactId);
  if (blocked) return blocked;
  return NextResponse.json({ dues: await patientDues(db, contactId) });
}
