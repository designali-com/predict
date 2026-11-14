import type { ChannelAdapter, SendParams, SendResult } from "./types";

const GRAPH_API_VERSION = "v21.0";

// WhatsApp's own caps on an interactive list, enforced here so a long
// availability list fails as a truncated-but-delivered message rather than
// a 400 from Meta.
const MAX_LIST_ROWS = 10;
const MAX_ROW_TITLE = 24;
const MAX_BUTTON_LABEL = 20;

export interface ListOption {
  id: string;
  title: string;
  description?: string;
}

/**
 * Which number this message leaves from.
 *
 * Passed in by the caller once a clinic has its own number (see
 * clinic_channel); falls back to the single env-configured number, which is
 * how one number serves every clinic today. Tokens are still only ever read
 * from the environment — the caller hands over the value, never a secret
 * fetched from the database.
 */
export interface WhatsAppSender {
  phoneNumberId: string;
  accessToken: string;
}

async function postMessage(
  payload: Record<string, unknown>,
  sender?: WhatsAppSender | null,
): Promise<SendResult> {
  const phoneNumberId = sender?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = sender?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return { status: "failed", error: "WhatsApp credentials not configured" };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    const body = (await response.json().catch(() => null)) as
      | { messages?: { id: string }[]; error?: { message?: string } }
      | null;

    if (!response.ok) {
      return { status: "failed", error: body?.error?.message ?? `HTTP ${response.status}` };
    }

    return { status: "sent", providerMessageId: body?.messages?.[0]?.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The header component for a media template.
 *
 * A TEXT header needs nothing here unless it carries placeholders, which this
 * builder does not produce; NONE obviously needs nothing either.
 */
/** `abc123-optm-brochure.pdf` → `optm-brochure.pdf`, so the chat shows a name rather than the storage key. */
function documentFilename(url: string): string {
  const last = decodeURIComponent(url.split("?")[0]?.split("/").pop() ?? "document.pdf");
  const stripped = last.replace(/^[a-f0-9]{16}-/i, "");
  return stripped.toLowerCase().endsWith(".pdf") ? stripped : `${stripped}.pdf`;
}

function buildHeaderComponent(
  headerType: string | null | undefined,
  mediaUrl: string | null | undefined,
): Record<string, unknown> | null {
  if (!mediaUrl) return null;

  switch (headerType) {
    case "IMAGE":
      return { type: "header", parameters: [{ type: "image", image: { link: mediaUrl } }] };
    case "VIDEO":
      return { type: "header", parameters: [{ type: "video", video: { link: mediaUrl } }] };
    case "DOCUMENT":
      return {
        type: "header",
        parameters: [{ type: "document", document: { link: mediaUrl, filename: documentFilename(mediaUrl) } }],
      };
    default:
      return null;
  }
}

export const whatsappAdapter: ChannelAdapter = {
  async send(params: SendParams): Promise<SendResult> {
    if (!params.providerTemplateName) {
      return { status: "failed", error: "Template has no providerTemplateName set" };
    }

    // templateParameters carries the {{1}}, {{2}} ordering resolved from the
    // template's variablesSchema; the Object.values fallback is only for
    // callers that build SendParams directly.
    const values =
      params.templateParameters ?? Object.values(params.variables).map((v) => String(v ?? ""));
    const parameters = values.map((value) => ({ type: "text", text: value }));

    const components: Record<string, unknown>[] = [];

    // A media header has to be supplied on every send. The sample uploaded at
    // approval time is only what the reviewer looked at — it is not attached to
    // the template, so leaving this out fails with the unhelpfully generic
    // "Parameter format does not match format in the created template".
    const header = buildHeaderComponent(params.headerType, params.headerMediaUrl);
    if (header) components.push(header);

    if (parameters.length) components.push({ type: "body", parameters });

    // A link button whose URL ends in {{1}} takes its value on every send,
    // matched to the button by its position among all the buttons.
    const buttons = Array.isArray(params.ctaButtons) ? (params.ctaButtons as { type?: string; url?: string }[]) : [];
    let nextValue = 0;
    buttons.forEach((button, index) => {
      if (button.type !== "URL" || !button.url?.includes("{{")) return;
      const value = params.buttonParameters?.[nextValue++];
      if (value === undefined) return;
      components.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: value }] });
    });

    return postMessage(
      {
        to: params.to,
        type: "template",
        template: {
          name: params.providerTemplateName,
          language: { code: params.language || "en_US" },
          components: components.length ? components : undefined,
        },
      },
      params.sender,
    );
  },
};

/**
 * A sign-in code, through an AUTHENTICATION-category template.
 *
 * Meta allows a one-time code only in that category, and its layout is fixed
 * by Meta, not by us: "<code> is your verification code", an optional
 * security line, an optional expiry, and a copy-code button. The code has to
 * be supplied twice — once for the body and once for the button, which
 * copies it — or Meta rejects the send as not matching the template.
 */
export async function sendWhatsAppAuthCode(
  to: string,
  code: string,
  template: { name: string; language?: string | null },
  sender?: WhatsAppSender | null,
): Promise<SendResult> {
  return postMessage(
    {
      // Digits only — the Cloud API wants the country code and number with
      // no "+", which is also how every phone in this database is stored.
      to: to.replace(/\D/g, ""),
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language || "en_US" },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
        ],
      },
    },
    sender,
  );
}

/**
 * Free-form text — only deliverable inside the contact's open 24h customer
 * service window (i.e. as a reply to something they sent). Outside it Meta
 * rejects the call and the message is logged as failed.
 */
export async function sendWhatsAppText(
  to: string,
  body: string,
  sender?: WhatsAppSender | null,
): Promise<SendResult> {
  return postMessage(
    {
      to,
      type: "text",
      text: { preview_url: false, body },
    },
    sender,
  );
}

/**
 * An interactive list ("pick a date", "pick a time") — also session-only,
 * same 24h window rule as sendWhatsAppText. The row `id` values come back
 * verbatim on the patient's reply, which is how the booking nodes match a
 * tap to the slot it stood for.
 */
export async function sendWhatsAppInteractiveList(
  to: string,
  params: { bodyText: string; buttonLabel: string; options: ListOption[] },
  sender?: WhatsAppSender | null,
): Promise<SendResult> {
  if (params.options.length === 0) {
    return { status: "failed", error: "Interactive list needs at least one option" };
  }

  const rows = params.options.slice(0, MAX_LIST_ROWS).map((option) => ({
    id: option.id,
    title: option.title.slice(0, MAX_ROW_TITLE),
    ...(option.description ? { description: option.description } : {}),
  }));

  return postMessage(
    {
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: params.bodyText },
        action: {
          button: params.buttonLabel.slice(0, MAX_BUTTON_LABEL),
          sections: [{ rows }],
        },
      },
    },
    sender,
  );
}

export interface ReplyButton {
  id: string;
  title: string;
}

/** Up to three tap replies. Session-only, same 24h window as free text. */
export async function sendWhatsAppReplyButtons(
  to: string,
  params: { bodyText: string; buttons: ReplyButton[] },
  sender?: WhatsAppSender | null,
): Promise<SendResult> {
  const buttons = params.buttons.slice(0, 3).map((button) => ({
    type: "reply",
    reply: { id: button.id, title: button.title.slice(0, MAX_BUTTON_LABEL) },
  }));
  if (buttons.length === 0) {
    return { status: "failed", error: "Reply buttons need at least one option" };
  }

  return postMessage(
    {
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: params.bodyText },
        action: { buttons },
      },
    },
    sender,
  );
}
