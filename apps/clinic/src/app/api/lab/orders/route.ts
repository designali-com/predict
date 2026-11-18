import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { LAB_STAGES, labStageCounts, listLabOrders, type LabStage } from "@workspace/db/lab-orders";
import { requireApiPermission } from "@/src/lib/auth/permissions";

/**
 * The lab's order list (lab.predict.fit): every blood-test order, from our
 * clinics and partner hospitals alike.
 *
 * GET ?stage=to_book|booked|collected|reported|cancelled|open&q=&day=YYYY-MM-DD
 *     → { orders, counts }
 */
export async function GET(req: Request) {
  const session = await requireApiPermission("clinic.lab");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const raw = url.searchParams.get("stage");
  const stage = raw === "open" || LAB_STAGES.some((s) => s.value === raw) ? (raw as LabStage | "open") : null;
  const [orders, counts] = await Promise.all([
    listLabOrders(db, { stage, q: url.searchParams.get("q"), day: url.searchParams.get("day") }),
    labStageCounts(db),
  ]);
  return NextResponse.json({ orders, counts });
}
