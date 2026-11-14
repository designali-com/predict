import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contactForDocuments, deletePersonDocument, personDocumentFile } from "@workspace/db/person-documents";
import { deleteFile } from "@workspace/storage";
import { requireClinicAnyPermission } from "@/src/lib/auth/clinic";
import { OPS_KEYS } from "@workspace/db/permissions";
import { canSeeLead, leadScope } from "@/src/lib/lead-access";
import { sideForStage } from "@workspace/db/contact-side";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const context = await requireClinicAnyPermission(OPS_KEYS);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, docId } = await params;
  const person = await contactForDocuments(db, id);
  if (!person || (person.clinicId && person.clinicId !== context.clinic.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await leadScope(context.principal);
  if (sideForStage(person.stage) === "leads" && !(await canSeeLead(scope, person.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = await personDocumentFile(db, person.id, docId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deletePersonDocument(db, row.id);
  await deleteFile(row.fileUrl);
  return NextResponse.json({ ok: true });
}
