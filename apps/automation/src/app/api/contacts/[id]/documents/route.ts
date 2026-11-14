import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import {
  addPersonDocument,
  appointmentBelongsToContact,
  checkDocumentFile,
  contactForDocuments,
  listPersonDocuments,
  parseDocumentKind,
} from "@workspace/db/person-documents";
import { deleteFile, uploadFile, withReadableUrls } from "@workspace/storage";
import { requireClinicAnyPermission } from "@/src/lib/auth/clinic";
import { OPS_KEYS } from "@workspace/db/permissions";
import { canSeeLead, leadScope } from "@/src/lib/lead-access";
import { sideForStage } from "@workspace/db/contact-side";

async function personFor(id: string) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const person = await contactForDocuments(db, id);
  if (!person || (person.clinicId && person.clinicId !== context.clinic.id)) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  const scope = await leadScope(context.principal);
  if (sideForStage(person.stage) === "leads" && !(await canSeeLead(scope, person.id))) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { context, person };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await personFor((await params).id);
  if ("error" in found) return found.error;
  const documents = await withReadableUrls(await listPersonDocuments(db, found.person.id));
  return NextResponse.json({ documents });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const found = await personFor((await params).id);
  if ("error" in found) return found.error;
  const person = found.person;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });

  const check = checkDocumentFile({ name: file.name, type: file.type, size: file.size });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const appointmentId = String(form?.get("appointmentId") ?? "").trim();
  if (appointmentId && !(await appointmentBelongsToContact(db, appointmentId, person.id))) {
    return NextResponse.json({ error: "That appointment is not this person's." }, { status: 400 });
  }

  const note = String(form?.get("note") ?? "").trim().slice(0, 500);
  const body = Buffer.from(await file.arrayBuffer());
  const upload = await uploadFile({
    visibility: "private",
    folder: `documents/${person.id}`,
    fileName: file.name,
    body,
    contentType: check.mime,
  }).catch(() => null);
  if (!upload) return NextResponse.json({ error: "File storage refused the upload." }, { status: 502 });

  try {
    const saved = await addPersonDocument(db, {
      contactId: person.id,
      appointmentId: appointmentId || null,
      fileUrl: upload.url,
      fileName: file.name,
      mimeType: check.mime,
      sizeBytes: file.size,
      kind: parseDocumentKind(form?.get("kind"), check.kind),
      note: note || null,
      uploadedBy: found.context.session.user.id,
    });
    return NextResponse.json({ id: saved.id });
  } catch {
    await deleteFile(upload.url);
    return NextResponse.json({ error: "Could not save the document." }, { status: 500 });
  }
}
