import { NextResponse } from "next/server";
import { previewReply } from "@/src/ai/auto-reply";
import { requireClinicPermission } from "@/src/lib/auth/clinic";

/**
 * "What would it say?" — runs the model against the saved settings and
 * returns the answer. Sends nothing, so it can be tried on real wording
 * before anyone's WhatsApp is involved.
 */
export async function POST(req: Request) {
  const context = await requireClinicPermission("ops.ai_replies");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Type a message to try" }, { status: 400 });

  const result = await previewReply({
    clinicId: context.clinic.id,
    incomingText: message.slice(0, 1000),
    contactName: typeof b.name === "string" ? b.name : null,
    city: typeof b.city === "string" ? b.city : null,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result);
}
