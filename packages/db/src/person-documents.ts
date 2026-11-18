import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";
import { appointment, contact, patientRecord, personDocument } from "./schema";
import type * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

export const DOCUMENT_KINDS = ["report", "xray", "image", "pdf", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/tiff",
  "application/dicom",
]);

/**
 * The contact behind whatever id a details page was opened with.
 * Clinic pages are reached with a contact id, a chart id, or a login id.
 */
export async function contactForDocuments(db: Db, id: string) {
  const [direct] = await db
    .select({ id: contact.id, clinicId: contact.clinicId, stage: contact.stage })
    .from(contact)
    .where(eq(contact.id, id))
    .limit(1);
  if (direct) return direct;

  const [chart] = await db
    .select({ contactId: patientRecord.contactId })
    .from(patientRecord)
    .where(eq(patientRecord.id, id))
    .limit(1);
  const contactId = chart?.contactId ?? null;
  if (contactId) return contactForDocuments(db, contactId);

  const [byLogin] = await db
    .select({ id: contact.id, clinicId: contact.clinicId, stage: contact.stage })
    .from(contact)
    .where(eq(contact.userId, id))
    .limit(1);
  return byLogin ?? null;
}

export function checkDocumentFile(file: { name: string; type: string; size: number }):
  | { ok: true; mime: string; kind: DocumentKind }
  | { ok: false; error: string } {
  if (!file.name?.trim()) return { ok: false, error: "This file has no name." };
  if (file.size <= 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "Each file must be 20 MB or smaller." };

  const mime = (file.type || mimeFromName(file.name)).toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, error: "Upload a PDF, a report, an X-ray or an image." };
  }
  return { ok: true, mime, kind: kindFromFile(mime, file.name) };
}

export function parseDocumentKind(value: unknown, fallback: DocumentKind): DocumentKind {
  return DOCUMENT_KINDS.includes(value as DocumentKind) ? (value as DocumentKind) : fallback;
}

function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  if (ext === "dcm" || ext === "dicom") return "application/dicom";
  return "";
}

function kindFromFile(mime: string, name: string): DocumentKind {
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (mime === "application/dicom" || /\.dcm$/i.test(name)) return "xray";
  if (mime.startsWith("image/")) return "image";
  return "other";
}

export async function listPersonDocuments(db: Db, contactId: string) {
  return db
    .select({
      id: personDocument.id,
      contactId: personDocument.contactId,
      appointmentId: personDocument.appointmentId,
      fileUrl: personDocument.fileUrl,
      fileName: personDocument.fileName,
      mimeType: personDocument.mimeType,
      sizeBytes: personDocument.sizeBytes,
      kind: personDocument.kind,
      note: personDocument.note,
      createdAt: personDocument.createdAt,
    })
    .from(personDocument)
    .where(eq(personDocument.contactId, contactId))
    .orderBy(desc(personDocument.createdAt));
}

export async function appointmentBelongsToContact(db: Db, appointmentId: string, contactId: string) {
  const [row] = await db
    .select({ id: appointment.id })
    .from(appointment)
    .where(and(eq(appointment.id, appointmentId), eq(appointment.contactId, contactId)))
    .limit(1);
  return Boolean(row);
}

export async function addPersonDocument(
  db: Db,
  input: {
    contactId: string;
    appointmentId: string | null;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    kind: DocumentKind;
    note: string | null;
    uploadedBy: string | null;
  },
) {
  const [row] = await db.insert(personDocument).values(input).returning({ id: personDocument.id });
  return row!;
}

/** The stored file URL, when this document belongs to the contact. */
export async function personDocumentFile(db: Db, contactId: string, documentId: string) {
  const [row] = await db
    .select({ id: personDocument.id, fileUrl: personDocument.fileUrl })
    .from(personDocument)
    .where(and(eq(personDocument.id, documentId), eq(personDocument.contactId, contactId)))
    .limit(1);
  return row ?? null;
}

export async function deletePersonDocument(db: Db, documentId: string) {
  await db.delete(personDocument).where(eq(personDocument.id, documentId));
}
