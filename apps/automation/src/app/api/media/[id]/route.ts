import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { mediaAsset } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { requirePermission } from "@/src/lib/auth/guards";
import { deleteFile } from "@workspace/storage";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.media");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [asset] = await db.select().from(mediaAsset).where(eq(mediaAsset.id, id)).limit(1);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // By URL: deleteFile leaves alone anything not in our bucket, which is
  // what an asset uploaded before the move to S3 is.
  try {
    await deleteFile(asset.url);
  } catch (error) {
    console.error("Failed to delete the stored file (continuing to remove DB record):", error);
  }

  await db.delete(mediaAsset).where(eq(mediaAsset.id, id));
  return NextResponse.json({ success: true });
}
