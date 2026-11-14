import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationTemplate } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { requirePermission } from "@/src/lib/auth/guards";
import { parseTemplateBody } from "@/src/lib/parse-template-body";
import { submitTemplateToMeta } from "@/src/lib/whatsapp-templates";

const POSTGRES_FOREIGN_KEY_VIOLATION = "23503";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.templates");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [row] = await db.select().from(communicationTemplate).where(eq(communicationTemplate.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template: row });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.templates");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = parseTemplateBody(await req.json().catch(() => null));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const [row] = await db
      .update(communicationTemplate)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(communicationTemplate.id, id))
      .returning();

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let metaSubmission: Awaited<ReturnType<typeof submitTemplateToMeta>> | null = null;

    // Editing a WhatsApp template's content resubmits it — WABA doesn't let
    // you silently change an approved/pending template in place.
    if (parsed.channel === "whatsapp" && parsed.wabaCategory && parsed.bodyText) {
      metaSubmission = await submitTemplateToMeta({
        providerTemplateName: parsed.providerTemplateName || parsed.key,
        wabaCategory: parsed.wabaCategory,
        language: parsed.language,
        headerType: parsed.headerType,
        headerText: parsed.headerText,
        headerMediaUrl: parsed.headerMediaUrl,
        bodyText: parsed.bodyText,
        bodyExamples: parsed.bodyExamples,
        footerText: parsed.footerText,
        ctaButtons: parsed.ctaButtons,
      });

      await db
        .update(communicationTemplate)
        .set({
          submissionStatus: metaSubmission.submitted ? "pending" : "draft",
          wabaTemplateId: metaSubmission.wabaTemplateId ?? row.wabaTemplateId,
          // Why it did not go. Clearing this unconditionally hid the reason:
          // the toast carrying it disappeared with the next click and the row
          // sat in "draft" with nothing to say what Meta objected to.
          rejectionReason: metaSubmission.submitted ? null : (metaSubmission.error ?? null),
        })
        .where(eq(communicationTemplate.id, id));
    }

    return NextResponse.json({ template: row, metaSubmission });
  } catch (error) {
    console.error("Error updating template:", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("ops.templates");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await db.delete(communicationTemplate).where(eq(communicationTemplate.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code;
    if (code === POSTGRES_FOREIGN_KEY_VIOLATION) {
      return NextResponse.json(
        { error: "This template has already been used to send messages and can't be deleted." },
        { status: 409 },
      );
    }
    console.error("Error deleting template:", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
