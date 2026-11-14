/**
 * Demo mode — the same app, on fictional data, where nothing leaves.
 *
 * Switched on with DEMO_MODE=1 (server) and NEXT_PUBLIC_DEMO_MODE=1 (the
 * browser, for the banner and the "Try the demo" button). In demo mode:
 *
 *   - every call to an outside service (Meta / WhatsApp, SMS, Google, Resend)
 *     is answered here with a believable success, and never sent;
 *   - email is logged, not sent (see @workspace/communication/mailer);
 *   - uploads are kept inline (see @workspace/storage);
 *   - the data is the seed in packages/db/scripts/demo-seed.ts, reset nightly.
 *
 * The guard is a belt over the braces: a demo deploy should carry no real
 * keys at all, so even a path this file forgot has nothing to send with.
 */

export function isDemo(): boolean {
  // On unless switched off: this repo is the demo, and it runs with no settings.
  return process.env.DEMO_MODE !== "0";
}

/** Hosts a demo must never reach. Anything else (the database, Vercel) passes. */
const BLOCKED_HOSTS = [
  "graph.facebook.com",
  "graph.instagram.com",
  "control.msg91.com",
  "api.twilio.com",
  "oauth2.googleapis.com",
  "www.googleapis.com",
  "api.resend.com",
  "api.razorpay.com",
];

let counter = 0;
const fakeId = (prefix: string) => `${prefix}.DEMO${Date.now().toString(36)}${(counter++).toString(36)}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A believable answer for what the app asked an outside service. */
function fakeAnswer(url: URL, method: string): Response {
  const path = url.pathname;
  if (url.hostname.includes("facebook.com") || url.hostname.includes("instagram.com")) {
    // Sending a WhatsApp message.
    if (method === "POST" && /\/messages$/.test(path)) {
      return json({ messaging_product: "whatsapp", contacts: [{ wa_id: "0" }], messages: [{ id: fakeId("wamid") }] });
    }
    // Submitting a template for approval.
    if (method === "POST" && /\/message_templates$/.test(path)) {
      return json({ id: fakeId("tpl"), status: "APPROVED", category: "UTILITY" });
    }
    // Uploading media or a header sample.
    if (method === "POST" && /\/(media|uploads)/.test(path)) return json({ id: fakeId("media"), h: fakeId("handle") });
    // Lists (templates, insights, leads): empty is the safe answer.
    return json({ data: [], paging: {} });
  }
  if (url.hostname === "oauth2.googleapis.com") return json({ access_token: "demo", expires_in: 3600, token_type: "Bearer" });
  if (url.hostname === "api.resend.com") return json({ id: fakeId("email") });
  return json({ ok: true, demo: true });
}

let installed = false;

/**
 * Wrap fetch so that, in demo mode, nothing reaches an outside service.
 * Called once per server process from each app's instrumentation.ts.
 */
export function installDemoNetworkGuard(): void {
  if (installed || !isDemo()) return;
  installed = true;
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let url: URL | null = null;
    try {
      url = new URL(href);
    } catch {
      // A relative URL is our own app — let it through.
    }
    if (url && BLOCKED_HOSTS.some((h) => url!.hostname === h || url!.hostname.endsWith(`.${h}`))) {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      console.info(`[demo] blocked ${method} ${url.hostname}${url.pathname} — answered with a fake success`);
      return fakeAnswer(url, method);
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
  console.info("[demo] network guard on — no message, email or upload leaves this server");
}
