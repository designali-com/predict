import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { communicationTemplate } from "@workspace/db/schema";
import { desc, eq, ne } from "@workspace/db";
import { requireOperations, requirePermission } from "@/src/lib/auth/guards";
import { parseTemplateBody } from "@/src/lib/parse-template-body";
import { submitTemplateToMeta } from "@/src/lib/whatsapp-templates";

export async function GET() {
  const session = await requireOperations();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A template deleted on Meta keeps its row — sent messages point at it — but
  // is not offered anywhere again.
  const templates = await db
    .select()
    .from(communicationTemplate)
    .where(ne(communicationTemplate.submissionStatus, "deleted"))
    .orderBy(desc(communicationTemplate.createdAt));
  return NextResponse.json({ templates });
}

// Reading templates is an operations action — a coach picks one to open a
// conversation outside the 24h window. Creating one submits it to Meta for
// approval and changes what every flow can send, so that stays with admins.
export async function POST(req: Request) {
  const session = await requirePermission("ops.templates");
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseTemplateBody(await req.json().catch(() => null));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const [row] = await db.insert(communicationTemplate).values(parsed).returning();
    if (!row) throw new Error("Insert failed");

    let metaSubmission: Awaited<ReturnType<typeof submitTemplateToMeta>> | null = null;

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
          wabaTemplateId: metaSubmission.wabaTemplateId ?? null,
          // Why it did not go. The toast that carried this disappeared with the
          // next click, leaving a template sitting in "draft" with nothing on
          // the row to say what Meta objected to.
          rejectionReason: metaSubmission.submitted ? null : (metaSubmission.error ?? null),
        })
        .where(eq(communicationTemplate.id, row.id));
    }

    return NextResponse.json({ id: row.id, metaSubmission }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create template" },
      { status: 500 },
    );
  }
}
