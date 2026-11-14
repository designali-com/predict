import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import { isDemo } from "@workspace/db/demo-mode";

/**
 * The one way this codebase sends an email.
 *
 * There used to be four: the automation adapter, the staff-alert helper, and
 * a copy each in the clinic and patient apps for login codes. All four called
 * Resend directly, and the two login copies hard-coded
 * "onboarding@resend.dev" as the sender — an address Resend delivers only to
 * the owner of the Resend account. So every OTP and every verification email
 * either app ever sent went to one inbox, and no patient or staff member
 * received a single one.
 *
 * Now there is a transport choice, made once, from the environment:
 *
 *   SMTP    when SMTP_HOST is set — the clinic's own mailbox (Zoho, Google
 *           Workspace, Titan…), or Amazon SES's SMTP endpoint later. The
 *           same five variables cover all of them.
 *   Resend  when only RESEND_API_KEY is set, so nothing that works today
 *           stops working the day this ships.
 *
 * EMAIL_PROVIDER=smtp|resend forces one when both are configured.
 *
 * There is no fallback sender. A missing EMAIL_FROM is a configuration error
 * reported as one, not papered over with an address that quietly delivers to
 * nobody.
 */

export type MailProvider = "smtp" | "resend" | "none";

export interface MailMessage {
  to: string | string[];
  subject: string;
  /** Always sent. Clients that cannot render HTML, and spam filters, read this. */
  text: string;
  html?: string;
  replyTo?: string;
  /** Overrides EMAIL_FROM for this one message. Must still be an address the account may send as. */
  from?: string;
}

export interface MailResult {
  ok: boolean;
  provider: MailProvider;
  messageId?: string;
  error?: string;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Which transport a send would use right now. */
export function mailProvider(): MailProvider {
  const forced = env("EMAIL_PROVIDER")?.toLowerCase();
  if (forced === "smtp" || forced === "resend") return forced;
  if (env("SMTP_HOST")) return "smtp";
  if (env("RESEND_API_KEY")) return "resend";
  return "none";
}

/**
 * Why nothing can be sent, in words somebody can act on — or null when the
 * configuration is complete.
 *
 * Checked before every send rather than once at boot, so fixing the
 * environment and restarting is all it takes; there is no stale verdict.
 */
export function mailConfigProblem(): string | null {
  const provider = mailProvider();

  if (provider === "none") {
    return "No email transport configured — set SMTP_HOST, SMTP_USER and SMTP_PASS (or RESEND_API_KEY).";
  }
  if (!env("EMAIL_FROM")) {
    return 'EMAIL_FROM is not set — e.g. EMAIL_FROM="Predict <care@yourdomain.in>".';
  }
  if (/onboarding@resend\.dev/i.test(env("EMAIL_FROM")!)) {
    return "EMAIL_FROM is onboarding@resend.dev, which only ever reaches the Resend account owner. Use an address on your own domain.";
  }

  if (provider === "smtp") {
    const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((name) => !env(name));
    if (missing.length) return `SMTP is selected but ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set.`;
  }
  if (provider === "resend" && !env("RESEND_API_KEY")) {
    return "EMAIL_PROVIDER is resend but RESEND_API_KEY is not set.";
  }

  return null;
}

// ─── SMTP ──────────────────────────────────────────────────────────────────

let cachedTransport: { key: string; transport: Transporter } | null = null;

function smtpSettings() {
  const port = Number(env("SMTP_PORT") ?? 587);
  // 465 is TLS from the first byte; 587 and 25 start plain and upgrade with
  // STARTTLS. Getting this backwards is the commonest SMTP failure there is,
  // and it surfaces as a timeout rather than an error, so it is inferred
  // from the port unless somebody says otherwise.
  const secureSetting = env("SMTP_SECURE")?.toLowerCase();
  const secure = secureSetting ? secureSetting === "true" : port === 465;

  return {
    host: env("SMTP_HOST")!,
    port,
    secure,
    user: env("SMTP_USER")!,
    pass: env("SMTP_PASS")!,
  };
}

function smtpTransport(): Transporter {
  const settings = smtpSettings();
  // Keyed on the settings so a changed password in a long-running worker
  // does not keep reusing a pool that can no longer authenticate.
  const key = JSON.stringify([settings.host, settings.port, settings.secure, settings.user, settings.pass]);
  if (cachedTransport?.key === key) return cachedTransport.transport;

  cachedTransport?.transport.close();

  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    // On 587, refuse to send credentials over a connection that did not
    // upgrade to TLS rather than silently falling back to plain text.
    requireTLS: !settings.secure,
    auth: { user: settings.user, pass: settings.pass },
    // A pool, because a campaign or a sweep sends in bursts and opening a TLS
    // session per message is slow and gets a mailbox rate-limited. Three
    // connections is inside what Zoho and Google Workspace tolerate.
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    // Bounded, so a mail server that stops answering fails the send instead
    // of stalling the automation worker behind it indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  cachedTransport = { key, transport };
  return transport;
}

async function sendViaSmtp(message: MailMessage, from: string): Promise<MailResult> {
  try {
    const info = await smtpTransport().sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ?? env("EMAIL_REPLY_TO")
        ? { replyTo: message.replyTo ?? env("EMAIL_REPLY_TO") }
        : {}),
    });

    // A server can accept the message and still refuse every recipient; that
    // is not a delivery.
    const rejected = (info.rejected ?? []).map(String);
    if (rejected.length && !(info.accepted ?? []).length) {
      return { ok: false, provider: "smtp", error: `Recipient refused: ${rejected.join(", ")}` };
    }

    return { ok: true, provider: "smtp", messageId: info.messageId };
  } catch (error) {
    return { ok: false, provider: "smtp", error: describeSmtpError(error) };
  }
}

/**
 * SMTP failures, translated.
 *
 * The raw errors are protocol codes — "535 5.7.8", "ETIMEDOUT" — and the
 * person reading them is setting up a mailbox, not debugging a socket. Each
 * of these has one usual cause, so that is what is said.
 */
function describeSmtpError(error: unknown): string {
  const e = error as { code?: string; responseCode?: number; response?: string; message?: string };
  const raw = e.response || e.message || String(error);

  if (e.code === "EAUTH" || e.responseCode === 535 || e.responseCode === 534) {
    return (
      `SMTP login refused (${raw}). Check SMTP_USER and SMTP_PASS. Zoho and Google need an ` +
      "app-specific password here, not the mailbox's normal login password."
    );
  }
  if (e.code === "ETIMEDOUT" || e.code === "ESOCKET" || e.code === "ECONNECTION") {
    return (
      `Could not reach ${env("SMTP_HOST")}:${env("SMTP_PORT") ?? 587} (${raw}). ` +
      "Port 465 needs SMTP_SECURE=true and 587 needs it false; and AWS blocks outbound " +
      "port 25 by default, so do not use 25."
    );
  }
  if (e.responseCode === 550 || e.responseCode === 553 || e.responseCode === 554) {
    return (
      `The mail server refused the message (${raw}). The usual cause is EMAIL_FROM not ` +
      "matching the mailbox in SMTP_USER, or an alias of it."
    );
  }
  return raw;
}

// ─── Resend ────────────────────────────────────────────────────────────────

async function sendViaResend(message: MailMessage, from: string): Promise<MailResult> {
  try {
    const replyTo = message.replyTo ?? env("EMAIL_REPLY_TO");
    const response = await new Resend(env("RESEND_API_KEY")).emails.send({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(replyTo ? { replyTo } : {}),
    });

    if (response.error) return { ok: false, provider: "resend", error: response.error.message };
    return { ok: true, provider: "resend", messageId: response.data?.id };
  } catch (error) {
    return {
      ok: false,
      provider: "resend",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send one email. Never throws.
 *
 * Callers are a login flow, a background sweep and a campaign run — none of
 * which should crash because a mailbox is down — so a failure comes back as
 * a result with a reason, and the caller decides whether that matters.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  // Demo: the email is "sent" for the app's sake and logged, never delivered.
  if (isDemo()) {
    console.info(`[demo] email to ${message.to} not sent: "${message.subject}"`);
    return { ok: true, provider: mailProvider(), messageId: `demo-${Date.now().toString(36)}` };
  }
  const problem = mailConfigProblem();
  const provider = mailProvider();
  if (problem) return { ok: false, provider, error: problem };

  const from = message.from ?? env("EMAIL_FROM")!;

  return provider === "smtp" ? sendViaSmtp(message, from) : sendViaResend(message, from);
}

/**
 * Log in to the mail server without sending anything.
 *
 * For the setup check and the health endpoint: it proves the host, port,
 * TLS mode and credentials are right before a patient's login code depends
 * on them.
 */
export async function verifyMailTransport(): Promise<MailResult> {
  const problem = mailConfigProblem();
  const provider = mailProvider();
  if (problem) return { ok: false, provider, error: problem };

  if (provider === "resend") {
    // Resend has no handshake to try; a configured key is as far as it can
    // be checked without sending.
    return { ok: true, provider };
  }

  try {
    await smtpTransport().verify();
    return { ok: true, provider };
  } catch (error) {
    return { ok: false, provider, error: describeSmtpError(error) };
  }
}

/** Close pooled connections, so a one-off script can exit. */
export function closeMailTransport(): void {
  cachedTransport?.transport.close();
  cachedTransport = null;
}
