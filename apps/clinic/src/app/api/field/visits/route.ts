import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { fieldVisits } from "@workspace/db/lab-orders";
import { requireApiPermission } from "@/src/lib/auth/permissions";

/** A field technician's own visits — nothing anyone else is doing. */
export async function GET() {
  const session = await requireApiPermission("clinic.field");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ visits: await fieldVisits(db, session.user.id) });
}
