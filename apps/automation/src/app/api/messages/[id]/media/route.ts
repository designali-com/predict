import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationMessage, communicationTemplate } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { readableUrl } from "@workspace/storage";
import { requireOperations } from "@/src/lib/auth/guards";

/**
 * GET — the file in a chat message: what a person sent us (variables.media),
 * or the image / video / PDF at the top of a template we sent.
 *
 * A fixed address that redirects to a short-lived signed link. The thread
 * refreshes every few seconds; handing it a freshly signed link each time
 * changed every image and video's src, so the browser fetched them all again
 * and a playing GIF restarted. This address never changes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [row] = await db
    .select({ variables: communicationMessage.variables, templateId: communicationMessage.templateId })
    .from(communicationMessage)
    .where(eq(communicationMessage.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let url = (row.variables as { media?: { url?: string } } | null)?.media?.url ?? null;
  if (!url && row.templateId) {
    const [template] = await db
      .select({ headerMediaUrl: communicationTemplate.headerMediaUrl })
      .from(communicationTemplate)
      .where(eq(communicationTemplate.id, row.templateId))
      .limit(1);
    url = template?.headerMediaUrl ?? null;
  }
  if (!url) return NextResponse.json({ error: "No file on this message" }, { status: 404 });

  const res = NextResponse.redirect(await readableUrl(url, 60 * 60), 302);
  // The browser keeps the answer for the life of the signed link, less a margin.
  res.headers.set("Cache-Control", "private, max-age=3000");
  return res;
}
