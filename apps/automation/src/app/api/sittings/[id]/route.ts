import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { logSitting } from "@workspace/db/enrollment-service";
import { requireAnyPermission } from "@/src/lib/auth/guards";

/**
 * One line of the log sheet, filled in from the operations console.
 *
 * Source is fixed to "staff" and cannot be sent by the caller: the point of
 * recording who said a therapy happened is lost the moment a client can claim
 * to be somebody else.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission(["ops.leads", "ops.patients"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  try {
    const sitting = await logSitting(db, {
      sittingId: id,
      status: body?.status,
      mode: body?.mode,
      note: body?.note,
      source: "staff",
      actorId: session.user.id,
    });
    return NextResponse.json({ sitting });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update this sitting" },
      { status: 400 },
    );
  }
}
