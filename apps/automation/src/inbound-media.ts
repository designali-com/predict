import { db } from "@workspace/db/client";
import { communicationMessage } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { uploadFile } from "@workspace/storage";

/**
 * What someone sent us that is not plain text — a photo, a video or GIF, a
 * voice note, a PDF, a sticker, a reaction, a location, a contact card.
 *
 * Text-only storage kept these as empty messages, so the inbox showed a blank
 * bubble where a patient had sent their report. The file is fetched from Meta
 * (its links need our token and expire), kept in our bucket as a private file,
 * and the message row carries where it is under variables.media — inbound
 * rows never use variables otherwise. The thread signs a fresh link to show it.
 */

export type InboundMediaKind = "image" | "video" | "audio" | "document" | "sticker";

export interface InboundMedia {
  kind: InboundMediaKind | "reaction" | "location" | "contact";
  /** Our private copy, once fetched. */
  url?: string;
  mime?: string;
  /** A document's file name. */
  name?: string;
  /** Meta's id, until the copy is made. */
  mediaId?: string;
  /** Still being fetched, or could not be. */
  pending?: boolean;
  error?: string;
  /** A voice note rather than an audio file. */
  voice?: boolean;
  /** A reaction's emoji. */
  emoji?: string;
  /** A location's map link. */
  mapUrl?: string;
  /** A GIF: WhatsApp sends one as an mp4 with no sound track. */
  gif?: boolean;
}

interface MetaMediaPart {
  id: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
  animated?: boolean;
}

export interface InboundPayload {
  type: string;
  image?: MetaMediaPart;
  video?: MetaMediaPart;
  audio?: MetaMediaPart;
  document?: MetaMediaPart;
  sticker?: MetaMediaPart;
  reaction?: { message_id?: string; emoji?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[];
}

const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_BYTES = 100 * 1024 * 1024;

/** The text for the bubble and the media to show, for anything that is not plain text. */
export function describeInbound(message: InboundPayload): { body: string | null; media: InboundMedia | null } {
  for (const kind of ["image", "video", "audio", "document", "sticker"] as const) {
    const part = message[kind];
    if (message.type === kind && part?.id) {
      return {
        body: part.caption?.trim() || null,
        media: {
          kind,
          mediaId: part.id,
          mime: part.mime_type,
          name: part.filename,
          voice: kind === "audio" ? part.voice === true : undefined,
          pending: true,
        },
      };
    }
  }
  if (message.type === "reaction" && message.reaction) {
    const emoji = message.reaction.emoji ?? "";
    // An empty emoji is a reaction taken back.
    return { body: emoji ? `Reacted ${emoji}` : "Removed a reaction", media: { kind: "reaction", emoji } };
  }
  if (message.type === "location" && message.location) {
    const { latitude, longitude, name, address } = message.location;
    const where = [name, address].filter(Boolean).join(", ");
    return {
      body: `📍 ${where || "Location"}`,
      media: {
        kind: "location",
        mapUrl: latitude != null && longitude != null ? `https://maps.google.com/?q=${latitude},${longitude}` : undefined,
      },
    };
  }
  if (message.type === "contacts" && message.contacts?.length) {
    const cards = message.contacts.map((c) => [c.name?.formatted_name, c.phones?.[0]?.phone].filter(Boolean).join(" — "));
    return { body: `👤 ${cards.join("\n👤 ")}`, media: { kind: "contact" } };
  }
  return { body: null, media: null };
}

/**
 * Whether an mp4 has a sound track. WhatsApp turns a GIF into an mp4 with a
 * picture track only and does not say so; a real video has a "soun" handler.
 */
export function hasSoundTrack(bytes: Buffer): boolean {
  for (let at = bytes.indexOf("hdlr"); at !== -1; at = bytes.indexOf("hdlr", at + 4)) {
    if (bytes.toString("latin1", at + 12, at + 16) === "soun") return true;
  }
  return false;
}

function extension(mime: string | undefined, name: string | undefined): string {
  const fromName = name?.match(/\.[a-z0-9]{1,6}$/i)?.[0];
  if (fromName) return fromName.toLowerCase();
  const sub = (mime ?? "").split(";")[0]!.split("/")[1] ?? "bin";
  return `.${{ jpeg: "jpg", "x-m4a": "m4a", mpeg: "mp3", quicktime: "mov", plain: "txt" }[sub] ?? sub}`;
}

/**
 * Fetch the file from Meta, keep a private copy, and record it on the message.
 * Never throws: a file that cannot be had leaves the bubble saying so.
 */
export async function storeInboundMedia(messageRowId: string, media: InboundMedia, accessToken?: string | null): Promise<void> {
  const token = accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  let result: InboundMedia;
  try {
    if (!token) throw new Error("WhatsApp token not configured");
    if (!media.mediaId) throw new Error("no media id");
    const auth = { Authorization: `Bearer ${token}` };
    const meta = (await (await fetch(`${GRAPH}/${media.mediaId}`, { headers: auth, signal: AbortSignal.timeout(20_000) })).json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
      error?: { message?: string };
    };
    if (!meta.url) throw new Error(meta.error?.message ?? "Meta gave no link for the file");
    if (meta.file_size && meta.file_size > MAX_BYTES) throw new Error("file is larger than 100 MB");
    const res = await fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const mime = meta.mime_type ?? media.mime ?? "application/octet-stream";
    const fileName = media.name || `${media.kind}${extension(mime, undefined)}`;
    const saved = await uploadFile({ visibility: "private", folder: "whatsapp-inbound", fileName, body: bytes, contentType: mime });
    const gif = media.kind === "video" && /mp4/.test(mime) && !hasSoundTrack(bytes);
    result = { ...media, url: saved.url, mime, pending: false, mediaId: undefined, ...(gif ? { gif: true } : {}) };
  } catch (error) {
    result = { ...media, pending: false, error: error instanceof Error ? error.message : String(error) };
    console.error(`[automation] inbound media for message ${messageRowId} not stored:`, result.error);
  }
  await db
    .update(communicationMessage)
    .set({ variables: { media: result } })
    .where(eq(communicationMessage.id, messageRowId))
    .catch((err) => console.error("[automation] recording inbound media failed:", err));
}
