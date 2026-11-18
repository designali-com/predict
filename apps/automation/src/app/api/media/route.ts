import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { mediaAsset } from "@workspace/db/schema";
import { desc } from "@workspace/db";
import { requirePermission } from "@/src/lib/auth/guards";
import { uploadFile } from "@workspace/storage";

function classifyAsset(mimeType: string): "image" | "video" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

export async function GET() {
  const session = await requirePermission("ops.media");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assets = await db.select().from(mediaAsset).orderBy(desc(mediaAsset.createdAt));
  return NextResponse.json({ assets });
}

export async function POST(req: Request) {
  const session = await requirePermission("ops.media");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const assetType = classifyAsset(file.type);
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  try {
    // Public: Meta fetches a template's header media by URL, with no way to sign in.
    const upload = await uploadFile({
      visibility: "public",
      folder: "media",
      fileName: file.name,
      body: buffer,
      contentType: file.type,
    });

    const [row] = await db
      .insert(mediaAsset)
      .values({
        url: upload.url,
        publicId: upload.key,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        assetType,
        sizeBytes: file.size,
        uploadedBy: session.user.id,
      })
      .returning();

    return NextResponse.json({ asset: row }, { status: 201 });
  } catch (error) {
    console.error("Error uploading media:", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
