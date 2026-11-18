import { NextResponse } from "next/server"
import { headers } from "next/headers"
import sharp from "sharp"
import { deleteFile, uploadFile } from "@workspace/storage"
import { auth } from "@/src/lib/auth/auth"

/**
 * The patient's profile photo — set, replace, or remove.
 *
 * Cropped to a 400px square here and stored as WebP in the bucket's public
 * part (an avatar is drawn by an <img> in every header, so it needs a plain
 * URL; the key has a random part, so the URL cannot be guessed). The previous
 * photo is deleted once the new one is saved. Saved through better-auth's
 * updateUser, so the session — and with it the avatar in the header and the
 * sidebar — picks the change up, not just this page.
 */

const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ["image/jpeg", "image/png", "image/webp"]

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 })
  }
  if (!TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Use a JPG, PNG or WebP photo." }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That photo is over 5 MB — choose a smaller one." }, { status: 400 })
  }

  try {
    // rotate() first, so a phone photo taken sideways is stored upright;
    // "attention" keeps the busiest part of the frame — usually the face.
    const square = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(400, 400, { fit: "cover", position: sharp.strategy.attention })
      .webp({ quality: 85 })
      .toBuffer()

    const upload = await uploadFile({
      visibility: "public",
      folder: `avatars/${session.user.id}`,
      fileName: "photo.webp",
      body: square,
      contentType: "image/webp",
    })

    const previous = session.user.image
    await auth.api.updateUser({ headers: await headers(), body: { image: upload.url } })
    await deleteFile(previous).catch(() => {})
    return NextResponse.json({ image: upload.url })
  } catch (error) {
    console.error("[profile/photo] upload failed:", error)
    return NextResponse.json({ error: "Could not upload that photo. Please try again." }, { status: 500 })
  }
}

export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    await auth.api.updateUser({ headers: await headers(), body: { image: null } })
    // Best effort: the account no longer points at it either way. An old
    // Cloudinary photo is not in our bucket and is simply left.
    await deleteFile(session.user.image).catch(() => {})
    return NextResponse.json({ image: null })
  } catch (error) {
    console.error("[profile/photo] remove failed:", error)
    return NextResponse.json({ error: "Could not remove the photo. Please try again." }, { status: 500 })
  }
}
