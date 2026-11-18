import "dotenv/config";
import { db } from "@workspace/db/client";
import { communicationTemplate } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { submitTemplateToMeta } from "./lib/whatsapp-templates";
import type { HeaderType, TemplateButton, WabaCategory } from "./lib/whatsapp-templates";

// Submits an already-saved draft template to Meta for approval — the same
// call the dashboard makes on create, for templates that were saved while
// WHATSAPP_WABA_ID was still unset. Usage: pnpm submit:template <key>
const key = process.argv[2];
if (!key) {
  console.error("usage: tsx src/submit-template.ts <template-key>");
  process.exit(1);
}

const [row] = await db
  .select()
  .from(communicationTemplate)
  .where(eq(communicationTemplate.key, key))
  .limit(1);

if (!row) {
  console.error(`No template with key "${key}"`);
  process.exit(1);
}
if (row.channel !== "whatsapp") {
  console.error(`Template "${key}" is on the ${row.channel} channel, not whatsapp`);
  process.exit(1);
}
if (!row.bodyText || !row.wabaCategory) {
  console.error(`Template "${key}" has no bodyText/wabaCategory — finish it in the builder first`);
  process.exit(1);
}

const result = await submitTemplateToMeta({
  providerTemplateName: row.providerTemplateName || row.key,
  wabaCategory: row.wabaCategory as WabaCategory,
  language: row.language ?? "en_US",
  headerType: row.headerType as HeaderType,
  headerText: row.headerText,
  headerMediaUrl: row.headerMediaUrl,
  bodyText: row.bodyText,
  bodyExamples: (row.bodyExamples as string[]) ?? [],
  footerText: row.footerText,
  ctaButtons: (row.ctaButtons as TemplateButton[]) ?? [],
});

console.log(result);

if (result.submitted) {
  await db
    .update(communicationTemplate)
    .set({
      submissionStatus: "pending",
      wabaTemplateId: result.wabaTemplateId ?? null,
      providerTemplateName: row.providerTemplateName || row.key,
    })
    .where(eq(communicationTemplate.id, row.id));
  console.log(`\n"${key}" submitted — status pending, waiting on Meta review.`);
} else {
  console.error(`\nSubmission failed: ${result.error}`);
  process.exit(1);
}

process.exit(0);
