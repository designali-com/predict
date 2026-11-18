import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contactForDocuments, deletePersonDocument, personDocumentFile } from "@workspace/db/person-documents";
import { deleteFile } from "@workspace/storage";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { guardPatient } from "@/src/lib/auth/patient-scope";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const context = await requireClinicApiAnyPermission(["clinic.patients", "clinic.appointments"]);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, docId } = await params;
  const person = await contactForDocuments(db, id);
  if (!person || (person.clinicId && person.clinicId !== context.clinic.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = await personDocumentFile(db, person.id, docId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deletePersonDocument(db, row.id);
  await deleteFile(row.fileUrl);
  return NextResponse.json({ ok: true });
}
