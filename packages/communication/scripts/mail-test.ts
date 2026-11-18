/**
 * Check the email setup end to end, in the order things go wrong.
 *
 *   pnpm --filter @workspace/communication mail:test                 # config + login + DNS
 *   pnpm --filter @workspace/communication mail:test you@gmail.com   # …and send a test email
 *
 * Reads apps/automation/.env by default; MAIL_ENV_FILE=path points it at
 * another app's .env.
 *
 * Nothing here is a secret-printing tool: it says whether each value is set,
 * never what it is.
 */
import { resolveMx, resolveTxt } from "node:dns/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  closeMailTransport,
  mailConfigProblem,
  mailProvider,
  sendMail,
  verifyMailTransport,
} from "../src/mailer";

const envFile = resolve(process.env.MAIL_ENV_FILE ?? "../../apps/automation/.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const recipient = process.argv[2];
const PASS = "✓";
const FAIL = "✗";
const WARN = "!";

let failures = 0;
const line = (mark: string, text: string) => {
  if (mark === FAIL) failures++;
  console.log(`  ${mark} ${text}`);
};

async function txt(name: string): Promise<string[]> {
  try {
    return (await resolveTxt(name)).map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

/** The address inside `Name <addr@domain>`, or the whole thing if bare. */
function fromDomain(from: string | undefined): string | null {
  const address = from?.match(/<([^>]+)>/)?.[1] ?? from;
  return address?.split("@")[1]?.trim().toLowerCase() || null;
}

async function main() {
  console.log(`\nEnv file: ${existsSync(envFile) ? envFile : "(none found — using the shell's environment)"}`);

  // ── 1. Configuration ─────────────────────────────────────────────────────
  console.log("\n1. Configuration");
  const provider = mailProvider();
  line(provider === "none" ? FAIL : PASS, `transport: ${provider}`);
  for (const name of ["EMAIL_FROM", "EMAIL_REPLY_TO", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"]) {
    const set = Boolean(process.env[name]?.trim());
    const shown = name === "EMAIL_FROM" || name === "SMTP_HOST" || name === "SMTP_PORT" || name === "SMTP_SECURE";
    console.log(`      ${name.padEnd(15)} ${set ? (shown ? process.env[name] : "set") : "—"}`);
  }
  const problem = mailConfigProblem();
  if (problem) line(FAIL, problem);

  // ── 2. Login ─────────────────────────────────────────────────────────────
  console.log("\n2. Mail server login");
  if (problem) {
    line(WARN, "skipped — fix the configuration first");
  } else {
    const verified = await verifyMailTransport();
    line(verified.ok ? PASS : FAIL, verified.ok ? `logged in via ${verified.provider}` : verified.error!);
  }

  // ── 3. DNS ───────────────────────────────────────────────────────────────
  const domain = fromDomain(process.env.EMAIL_FROM);
  console.log(`\n3. DNS for ${domain ?? "(no EMAIL_FROM domain)"}`);

  if (domain) {
    let mx: { exchange: string }[] = [];
    try {
      mx = await resolveMx(domain);
    } catch {
      mx = [];
    }
    line(
      mx.length ? PASS : WARN,
      mx.length
        ? `MX: ${mx.map((m) => m.exchange).join(", ")}`
        : "MX: none — replies to this address will bounce",
    );

    const spf = (await txt(domain)).filter((r) => r.toLowerCase().startsWith("v=spf1"));
    if (spf.length === 0) line(FAIL, "SPF: missing — mail from this domain will land in spam");
    else if (spf.length > 1) line(FAIL, `SPF: ${spf.length} records — there must be exactly one; merge them`);
    else line(PASS, `SPF: ${spf[0]}`);

    const dmarc = (await txt(`_dmarc.${domain}`)).find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    line(dmarc ? PASS : FAIL, dmarc ? `DMARC: ${dmarc}` : "DMARC: missing — Gmail and Yahoo now reject bulk mail without it");

    // DKIM lives at <selector>._domainkey, and the selector is the provider's
    // choice. Try the ones the common providers use; DKIM_SELECTOR adds yours.
    const selectors = [
      process.env.DKIM_SELECTOR,
      "zmail", // Zoho
      "google", // Google Workspace
      "titan1", // Titan / Hostinger
      "resend",
      "default",
      "selector1", // Microsoft 365
    ].filter(Boolean) as string[];

    const found: string[] = [];
    for (const selector of [...new Set(selectors)]) {
      const record = (await txt(`${selector}._domainkey.${domain}`)).find((r) => /v=DKIM1|k=rsa|p=/i.test(r));
      if (record) found.push(selector);
    }
    line(
      found.length ? PASS : FAIL,
      found.length
        ? `DKIM: found at ${found.map((s) => `${s}._domainkey`).join(", ")}`
        : "DKIM: not found — set DKIM_SELECTOR to your provider's selector if it is not a common one",
    );
  }

  // ── 4. Send ──────────────────────────────────────────────────────────────
  console.log("\n4. Test email");
  if (!recipient) {
    line(WARN, "skipped — pass an address to send one: mail:test you@example.com");
  } else if (problem) {
    line(WARN, "skipped — fix the configuration first");
  } else {
    const sent = await sendMail({
      to: recipient,
      subject: "PREDICT — email setup test",
      text:
        "This is a test from the PREDICT mail setup check.\n\n" +
        "If it reached your inbox, sending works. If it reached spam, look at the SPF, DKIM " +
        "and DMARC lines in the check's output — one of them is missing or wrong.\n",
    });
    line(sent.ok ? PASS : FAIL, sent.ok ? `sent to ${recipient} (${sent.messageId ?? "no id"})` : sent.error!);
  }

  closeMailTransport();
  console.log(failures ? `\n${failures} problem(s) to fix.\n` : "\nAll checks passed.\n");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  closeMailTransport();
  process.exit(1);
});
