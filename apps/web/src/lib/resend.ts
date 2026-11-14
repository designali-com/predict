import { Resend } from "resend";

/**
 * The Resend client, made on first use.
 *
 * Made at import before, which threw "Missing API key" the moment any route
 * that imports it was loaded — and `next build` loads every route to collect
 * page data, so a build without RESEND_API_KEY (the demo) failed outright.
 *
 * In demo mode it is a stand-in: the waitlist call "succeeds" and nothing is
 * sent anywhere.
 */
let client: Resend | null = null;

const demoContacts = {
  create: async (_: { email: string; firstName?: string; unsubscribed?: boolean }) => ({
    data: { id: `demo-${Date.now().toString(36)}` },
    error: null,
  }),
};

export const resend: { readonly contacts: Resend["contacts"] } = {
  get contacts(): Resend["contacts"] {
    if (process.env.DEMO_MODE !== "0") {
      return demoContacts as unknown as Resend["contacts"];
    }
    client ??= new Resend(process.env.RESEND_API_KEY);
    return client.contacts;
  },
};
