import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { appointment, contact, emgRecording, patientRecord } from "@workspace/db/schema";
import { and, desc, eq } from "@workspace/db";
import { ensurePatientRecord } from "@workspace/db/patient-registry";
import { deleteFile, readableUrl, uploadFile } from "@workspace/storage";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { denyPartner, guardPatient } from "@/src/lib/auth/patient-scope";

const CAN_USE = ["clinic.patients", "clinic.appointments", "clinic.biomarkers"];
const HZ = 500;
/** Ten minutes is the most one recording keeps. */
const MAX_SAMPLES = HZ * 60 * 10;

async function chartFor(id: string) {
  const [byId] = await db.select().from(patientRecord).where(eq(patientRecord.id, id)).limit(1);
  if (byId) return byId;
  const [byContact] = await db.select().from(patientRecord).where(eq(patientRecord.contactId, id)).limit(1);
  return byContact ?? null;
}

function listRow(r: typeof emgRecording.$inferSelect, rawUrl: string | null) {
  return {
    id: r.id,
    appointmentId: r.appointmentId,
    protocolName: r.protocolName,
    montage: r.montage,
    side: r.side,
    placements: r.placements,
    device: r.device,
    sampleRateHz: r.sampleRateHz,
    durationSeconds: r.durationSeconds,
    samplesReceived: r.samplesReceived,
    samplesMissing: r.samplesMissing,
    markers: r.markers,
    metrics: r.metrics,
    envelope: r.envelope,
    force: r.force,
    rawUrl,
    notes: r.notes,
    recordedAt: r.recordedAt,
  };
}

/** One patient's EMG recordings, newest first, each with a short-lived link to its raw signal. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const blocked = await guardPatient(id);
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_USE);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chart = await chartFor(id);
  if (!chart) return NextResponse.json({ patientId: null, recordings: [] });

  const rows = await db
    .select()
    .from(emgRecording)
    .where(eq(emgRecording.patientId, chart.id))
    .orderBy(desc(emgRecording.recordedAt));

  const recordings = await Promise.all(
    rows.map(async (r) => listRow(r, r.rawUrl ? await readableUrl(r.rawUrl, 60 * 60).catch(() => null) : null)),
  );
  return NextResponse.json({ patientId: chart.id, recordings });
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Plain JSON only, and not too much of it — what the browser worked out is stored as it came. */
function jsonOf(v: unknown, maxChars: number): unknown {
  if (v == null) return null;
  const s = JSON.stringify(v);
  if (!s || s.length > maxChars) return null;
  return JSON.parse(s);
}

/**
 * Save a recording made in the browser.
 *
 * POST {
 *   protocolName, montage?, side?, placements, device, appointmentId?,
 *   durationSeconds, samplesMissing, markers, metrics, envelope, force?, notes?,
 *   channelCount: 3 (one band) or 6 (two bands: band 1 CH1–3, then band 2 CH1–3),
 *   raw: base64 of little-endian u16 ADC codes, interleaved per sample in that channel order
 * }
 *
 * The raw signal goes to the private bucket as a gzipped CSV (sample, t, ch1,
 * ch2, ch3) any EMG tool can open; the row keeps the rest.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const blocked = (await denyPartner()) ?? (await guardPatient(id));
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_USE);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // As with VALD: a first-visit patient gets their chart when the first recording is saved.
  let chart = await chartFor(id);
  if (!chart) {
    const [person] = await db.select({ id: contact.id }).from(contact).where(eq(contact.id, id)).limit(1);
    if (!person) return NextResponse.json({ error: "No such patient" }, { status: 404 });
    const made = await ensurePatientRecord(db, person.id);
    if (made) chart = (await db.select().from(patientRecord).where(eq(patientRecord.id, made.patientId)).limit(1))[0] ?? null;
  }
  if (!chart) return NextResponse.json({ error: "Could not open a chart for this patient." }, { status: 400 });

  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  const protocolName = text(body.protocolName, 120);
  if (!protocolName) return NextResponse.json({ error: "Pick a protocol" }, { status: 400 });

  let appointmentId: string | null = null;
  let clinicId: string | null = null;
  if (typeof body.appointmentId === "string" && body.appointmentId) {
    const [visit] = await db
      .select({ id: appointment.id, contactId: appointment.contactId, clinicId: appointment.clinicId })
      .from(appointment)
      .where(eq(appointment.id, body.appointmentId))
      .limit(1);
    if (!visit || visit.contactId !== chart.contactId) {
      return NextResponse.json({ error: "That visit is not this patient's." }, { status: 400 });
    }
    appointmentId = visit.id;
    clinicId = visit.clinicId;
  }

  // The raw codes: one band, or two lined up on one clock.
  const CHANNELS = body.channelCount === 6 ? 6 : 3;
  const raw = typeof body.raw === "string" ? Buffer.from(body.raw, "base64") : null;
  if (!raw || raw.length < CHANNELS * 2 * HZ) {
    return NextResponse.json({ error: "Less than a second was recorded — nothing to save." }, { status: 400 });
  }
  const samples = Math.min(MAX_SAMPLES, Math.floor(raw.length / (CHANNELS * 2)));
  const head = Array.from({ length: CHANNELS }, (_, c) => (CHANNELS === 6 ? `b${Math.floor(c / 3) + 1}_ch${(c % 3) + 1}` : `ch${c + 1}`));
  const lines = [["sample", "t_seconds", ...head].join(",")];
  for (let i = 0; i < samples; i++) {
    const o = i * CHANNELS * 2;
    const row = [String(i), (i / HZ).toFixed(3)];
    for (let c = 0; c < CHANNELS; c++) row.push(String(raw.readUInt16LE(o + c * 2)));
    lines.push(row.join(","));
  }

  const recordId = randomUUID();
  const recordedAt = new Date();
  let rawUrl: string | null = null;
  try {
    const stored = await uploadFile({
      visibility: "private",
      folder: `emg-recordings/${chart.id}`,
      fileName: `${chart.patientCode ?? chart.id}-${recordedAt.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv.gz`,
      body: gzipSync(lines.join("\n")),
      contentType: "application/gzip",
    });
    rawUrl = stored.url;
  } catch (e) {
    console.error("[emg] raw upload failed", e);
    return NextResponse.json({ error: "Could not store the signal. Try saving again." }, { status: 502 });
  }

  const device = (body.device ?? {}) as Record<string, unknown>;
  const [row] = await db
    .insert(emgRecording)
    .values({
      id: recordId,
      patientId: chart.id,
      appointmentId,
      clinicId,
      protocolName,
      montage: text(body.montage, 80),
      side: text(body.side, 20),
      placements: jsonOf(body.placements, 8_000) ?? [],
      device: {
        band: text(device.band, 60),
        battery: num(device.battery),
        // Two-band recordings: each band, where it was, and how it lined up with the first.
        bands: Array.isArray(device.bands)
          ? device.bands.slice(0, 2).map((b: Record<string, unknown>) => ({
              name: text(b?.name, 60),
              site: text(b?.site, 30),
              battery: num(b?.battery),
              offsetSamples: num(b?.offsetSamples),
              missing: num(b?.missing),
            }))
          : undefined,
        test: text(device.test, 160),
        dynamo: text(device.dynamo, 60),
        recordedBy: { id: session.user.id, name: session.user.name },
      },
      sampleRateHz: HZ,
      channelCount: CHANNELS,
      durationSeconds: samples / HZ,
      samplesReceived: samples,
      samplesMissing: Math.max(0, Math.round(num(body.samplesMissing) ?? 0)),
      markers: jsonOf(body.markers, 100_000) ?? [],
      metrics: jsonOf(body.metrics, 300_000) ?? {},
      envelope: jsonOf(body.envelope, 1_200_000) ?? {},
      force: jsonOf(body.force, 400_000),
      rawUrl,
      notes: text(body.notes, 2_000),
      recordedAt,
      recordedByUserId: session.user.id,
    })
    .returning();

  return NextResponse.json({ recording: listRow(row!, await readableUrl(rawUrl, 60 * 60).catch(() => null)) });
}

/** Remove a recording made by mistake, and its raw file. DELETE ?recordingId= */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const blocked = (await denyPartner()) ?? (await guardPatient(id));
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(CAN_USE);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chart = await chartFor(id);
  const recordingId = new URL(req.url).searchParams.get("recordingId");
  if (!chart || !recordingId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [gone] = await db
    .delete(emgRecording)
    .where(and(eq(emgRecording.id, recordingId), eq(emgRecording.patientId, chart.id)))
    .returning({ rawUrl: emgRecording.rawUrl });
  if (!gone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteFile(gone.rawUrl).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
