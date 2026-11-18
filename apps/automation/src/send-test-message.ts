import "dotenv/config";
import { whatsappAdapter } from "@workspace/communication/adapters/whatsapp";

// One-off smoke test of the real send path: builds the same Graph API call
// the flow engine makes, against a number you name. Nothing is written to
// the DB — this only answers "do the credentials actually deliver a
// message". Any arguments after the template name fill {{1}}, {{2}}, ... in
// order, which templates with body variables require.
// Usage: pnpm send:test <e164-phone> [template-name] [var1 var2 ...]
const [to, templateName = "hello_world", ...vars] = process.argv.slice(2);

if (!to) {
  console.error("usage: tsx src/send-test-message.ts <e164-phone> [template-name] [var1 var2 ...]");
  console.error('  e.g. tsx src/send-test-message.ts 919876543210 welcome_new_patient "Ankit"');
  process.exit(1);
}

const result = await whatsappAdapter.send({
  to,
  templateKey: templateName,
  providerTemplateName: templateName,
  language: "en_US",
  variables: Object.fromEntries(vars.map((v, i) => [String(i + 1), v])),
});

console.log(result);
process.exit(result.status === "sent" ? 0 : 1);
