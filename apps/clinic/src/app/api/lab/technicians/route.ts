import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { listTechnicians } from "@workspace/db/lab-orders";
import { requireApiPermission } from "@/src/lib/auth/permissions";

/** Who a collection can be assigned to: everyone whose role has Field visits. */
export async function GET() {
  const session = await requireApiPermission("clinic.lab");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ technicians: await listTechnicians(db) });
}
