import { db } from "@workspace/db/client";
import { communicationTemplate } from "@workspace/db/schema";
import { inArray } from "@workspace/db";

/**
 * What a chat bubble shows beside its text: the photo, video, voice note,
 * document or sticker a person sent (variables.media, see inbound-media.ts),
 * or the image / video / PDF at the top of a template we sent them.
 *
 * The link is the fixed /api/messages/<id>/media, which redirects to a signed
 * one: the thread refreshes every few seconds, and a link that changed each
 * time made every image and video load again (a playing GIF restarted).
 */

export interface BubbleMedia {
  kind: "image" | "video" | "audio" | "document" | "sticker" | "reaction" | "location" | "contact";
  url?: string;
  mime?: string;
  name?: string;
  voice?: boolean;
  emoji?: string;
  mapUrl?: string;
  /** A GIF — WhatsApp sends them as silent mp4s. */
  gif?: boolean;
  pending?: boolean;
  error?: string;
}

const HEADER_KIND: Record<string, BubbleMedia["kind"]> = { IMAGE: "image", VIDEO: "video", DOCUMENT: "document" };

type Row = { id: string; direction: string; templateId?: string | null; variables?: unknown };

export async function withMessageMedia<T extends Row>(rows: T[]): Promise<(T & { media: BubbleMedia | null })[]> {
  const templateIds = [...new Set(rows.map((r) => r.templateId).filter((id): id is string => !!id))];
  const templates = templateIds.length
    ? await db
        .select({ id: communicationTemplate.id, headerType: communicationTemplate.headerType, headerMediaUrl: communicationTemplate.headerMediaUrl })
        .from(communicationTemplate)
        .where(inArray(communicationTemplate.id, templateIds))
    : [];
  const byId = new Map(templates.map((t) => [t.id, t]));

  return Promise.all(
    rows.map(async (row) => {
      const stored = (row.variables as { media?: BubbleMedia } | null)?.media;
      if (stored && typeof stored === "object" && stored.kind) {
        return { ...row, media: { ...stored, url: stored.url ? `/api/messages/${row.id}/media` : undefined } };
      }
      const template = row.templateId ? byId.get(row.templateId) : undefined;
      const kind = template?.headerType ? HEADER_KIND[template.headerType] : undefined;
      if (kind && template?.headerMediaUrl) {
        const name = decodeURIComponent(template.headerMediaUrl.split("/").pop() ?? "").replace(/^[a-f0-9]{16}-/i, "");
        return { ...row, media: { kind, url: `/api/messages/${row.id}/media`, name } };
      }
      return { ...row, media: null };
    }),
  );
}
