import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { canAccessClinic } from "@workspace/db/clinic-service";
import { deleteChannel, listChannels, saveChannel } from "@workspace/db/clinic-channel";
import { requireClinicPermission } from "@/src/lib/auth/clinic";

/**
 * The WhatsApp numbers a clinic sends from.
 *
 * The access token is never stored here — the row names the environment
 * variable that holds it, and this endpoint only ever reports whether that
 * variable is present on the server, never its value.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicPermission("ops.clinics");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canAccessClinic(db, context.session.user, id))) {
    return NextResponse.json({ error: "Not your clinic" }, { status: 403 });
  }

  const channels = await listChannels(db, id);
  return NextResponse.json({
    channels: channels.map((c) => ({
      id: c.id,
      channel: c.channel,
      phoneNumberId: c.phoneNumberId,
      wabaId: c.wabaId,
      displayNumber: c.displayNumber,
      tokenEnvVar: c.tokenEnvVar,
      isDefault: c.isDefault,
      isActive: c.isActive,
      tokenPresent: !!(c.tokenEnvVar ? process.env[c.tokenEnvVar] : process.env.WHATSAPP_ACCESS_TOKEN),
    })),
    // What the one number in the environment is, so the first row can be
    // filled in without hunting through .env.
    envDefault: {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
      wabaId: process.env.WHATSAPP_WABA_ID ?? null,
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicPermission("ops.clinics");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canAccessClinic(db, context.session.user, id))) {
    return NextResponse.json({ error: "Not your clinic" }, { status: 403 });
  }

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const phoneNumberId = typeof b.phoneNumberId === "string" ? b.phoneNumberId.trim() : "";
  if (!phoneNumberId) return NextResponse.json({ error: "The number's phone number id is required" }, { status: 400 });

  try {
    const channel = await saveChannel(
      db,
      {
        clinicId: id,
        phoneNumberId,
        wabaId: typeof b.wabaId === "string" ? b.wabaId.trim() || null : null,
        displayNumber: typeof b.displayNumber === "string" ? b.displayNumber.trim() || null : null,
        tokenEnvVar: typeof b.tokenEnvVar === "string" ? b.tokenEnvVar.trim() || null : null,
        isDefault: b.isDefault === true,
        isActive: b.isActive !== false,
      },
      typeof b.id === "string" ? b.id : undefined,
    );
    return NextResponse.json({ channel });
  } catch (err) {
    // The unique index on phone_number_id: the same number cannot belong to
    // two clinics, because an inbound message could then go either way.
    const message = err instanceof Error ? err.message : String(err);
    const taken = message.includes("clinic_channel_number_unique");
    return NextResponse.json(
      { error: taken ? "That number is already attached to a clinic" : message },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireClinicPermission("ops.clinics");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canAccessClinic(db, context.session.user, id))) {
    return NextResponse.json({ error: "Not your clinic" }, { status: 403 });
  }

  const channelId = new URL(req.url).searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "Which number?" }, { status: 400 });

  await deleteChannel(db, channelId);
  return NextResponse.json({ ok: true });
}
