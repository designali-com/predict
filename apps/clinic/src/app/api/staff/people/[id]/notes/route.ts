import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { contactForDocuments } from "@workspace/db/person-documents";
import { addPersonNote, listPersonNotes } from "@workspace/db/person-notes";
import { requireClinicApiAnyPermission } from "@/src/lib/auth/clinic";
import { resolveRole } from "@/src/lib/auth/config";
import { guardPatient } from "@/src/lib/auth/patient-scope";

async function personFor(id: string) {
  const context = await requireClinicApiAnyPermission(["clinic.patients", "clinic.appointments"]);
  if (!context) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const person = await contactForDocuments(db, id);
  if (!person || (person.clinicId && person.clinicId !== context.clinic.id)) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { context, person };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const found = await personFor((await params).id);
  if ("error" in found) return found.error;
  const notes = await listPersonNotes(db, found.person.id);
  return NextResponse.json({ notes });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guardPatient((await params).id);
  if (blocked) return blocked;
  const found = await personFor((await params).id);
  if ("error" in found) return found.error;

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "Write a note first." }, { status: 400 });

  const created = await addPersonNote(db, {
    contactId: found.person.id,
    authorUserId: found.context.session.user.id,
    authorRole: resolveRole(found.context.session.user.role),
    content: content.slice(0, 4000),
  });
  if (!created) return NextResponse.json({ error: "Could not save the note." }, { status: 500 });

  return NextResponse.json(
    {
      note: {
        ...created,
        authorName: found.context.session.user.name,
      },
    },
    { status: 201 },
  );
}
