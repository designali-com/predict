import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { clinic } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { canAccessClinic, updateClinic } from "@workspace/db/clinic-service";
import { deleteFile, uploadFile } from "@workspace/storage";
import { requireClinicPermission } from "@/src/lib/auth/clinic";

/**
 * A clinic's logo, dark-mode logo and tab icon. Public files: they head the
 * clinic panel's sidebar and its printed receipts.
 *
 * POST   multipart { kind: logo | logoDark | icon, file }
 * DELETE ?kind=logo | logoDark | icon
 */

const COLUMN = { logo: "logoUrl", logoDark: "logoDarkUrl", icon: "iconUrl" } as const;
type Kind = keyof typeof COLUMN;
const IMAGE = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_BYTES = 2 * 1024 * 1024;

async function guard(id: string) {
  const context = await requireClinicPermission("ops.clinics");
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessClinic(db, context.session.user, id))) {
    return NextResponse.json({ error: "Not your clinic" }, { status: 403 });
  }
  return null;
}

function kindOf(v: unknown): Kind | null {
  return v === "logo" || v === "logoDark" || v === "icon" ? v : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guard(id);
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const kind = kindOf(form?.get("kind"));
  const file = form?.get("file");
  if (!kind) return NextResponse.json({ error: "Say which image this is" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose an image" }, { status: 400 });
  if (!IMAGE.has(file.type)) return NextResponse.json({ error: "Use a PNG, JPG, WebP or SVG image" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Keep the image under 2 MB" }, { status: 400 });

  const current = await db.query.clinic.findFirst({ where: eq(clinic.id, id) });
  if (!current) return NextResponse.json({ error: "No such clinic" }, { status: 404 });

  const upload = await uploadFile({
    visibility: "public",
    folder: `clinics/${id}`,
    fileName: file.name,
    body: Buffer.from(await file.arrayBuffer()),
    contentType: file.type,
  }).catch(() => null);
  if (!upload) return NextResponse.json({ error: "File storage refused the image" }, { status: 502 });

  const updated = await updateClinic(db, id, { [COLUMN[kind]]: upload.url });
  // The one it replaces is no longer used anywhere.
  const old = current[COLUMN[kind]];
  if (old) await deleteFile(old).catch(() => undefined);
  return NextResponse.json({ clinic: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await guard(id);
  if (denied) return denied;

  const kind = kindOf(new URL(req.url).searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "Say which image to remove" }, { status: 400 });
  const current = await db.query.clinic.findFirst({ where: eq(clinic.id, id) });
  if (!current) return NextResponse.json({ error: "No such clinic" }, { status: 404 });

  const updated = await updateClinic(db, id, { [COLUMN[kind]]: null });
  const old = current[COLUMN[kind]];
  if (old) await deleteFile(old).catch(() => undefined);
  return NextResponse.json({ clinic: updated });
}
