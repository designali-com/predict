import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { automationFlow, contact } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { normalizePhone } from "@workspace/db/normalize-phone";
import { requirePermission } from "@/src/lib/auth/guards";
import { startRun } from "@/src/engine";
import { scheduleResumeIfWaiting } from "@/src/schedule-resume";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.flows");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const entered = typeof body?.contactId === "string" ? body.contactId.trim() : "";

  if (!entered) {
    return NextResponse.json({ error: "Enter a phone number" }, { status: 400 });
  }

  // Staff type the number they want to test on, not a contact id. An id
  // still works for anyone who has one to hand.
  let contactId = entered;
  if (!UUID.test(entered)) {
    const phone = normalizePhone(entered);
    if (!phone.ok) return NextResponse.json({ error: phone.error }, { status: 400 });

    const matches = await db
      .select({ id: contact.id, clinicId: contact.clinicId })
      .from(contact)
      .where(eq(contact.phone, phone.phone));
    if (matches.length === 0) {
      return NextResponse.json(
        { error: `No contact with ${phone.phone}. Add them on Leads or Conversations first, then test.` },
        { status: 404 },
      );
    }
    // The same number can be a contact at two clinics; prefer the flow's own.
    const [flow] = await db
      .select({ clinicId: automationFlow.clinicId })
      .from(automationFlow)
      .where(eq(automationFlow.id, id))
      .limit(1);
    contactId = (matches.find((m) => flow?.clinicId && m.clinicId === flow.clinicId) ?? matches[0]!).id;
  }

  try {
    const runId = await startRun({
      flowId: id,
      contactId,
      initialContext: { contactId, test: true },
    });
    await scheduleResumeIfWaiting(runId);
    return NextResponse.json({ runId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start test run" },
      { status: 500 },
    );
  }
}
