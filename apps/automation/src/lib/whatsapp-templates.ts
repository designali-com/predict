// Shapes used across the template builder, preview, and Meta submission —
// mirrors what the WhatsApp Business API (Cloud API) actually expects for
// POST /{waba-id}/message_templates, per Meta's message-templates docs.

export type WabaCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type HeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
  /**
   * A full sample link, for a URL whose end is a variable
   * ("https://…/l/{{1}}"). Meta refuses such a button without one.
   */
  example?: string;
}

export interface TemplateData {
  providerTemplateName: string;
  wabaCategory: WabaCategory;
  language: string;
  headerType: HeaderType;
  headerText?: string | null;
  headerMediaUrl?: string | null;
  /**
   * Meta's handle for the sample media, from the resumable upload API. A URL
   * is not accepted when creating a template — see uploadHeaderSample.
   */
  headerHandle?: string | null;
  bodyText: string;
  bodyExamples: string[];
  footerText?: string | null;
  ctaButtons: TemplateButton[];
}

// WhatsApp template naming rule: lowercase alphanumeric + underscores only.
export function slugifyTemplateName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 512);
}

// {{1}}, {{2}}, ... in order of first appearance.
export function extractPlaceholders(bodyText: string): number[] {
  const matches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return [...new Set(matches)].sort((a, b) => a - b);
}

interface MetaComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  example?: unknown;
  buttons?: Record<string, unknown>[];
}

export function buildMetaComponents(template: TemplateData): MetaComponent[] {
  const components: MetaComponent[] = [];

  if (template.headerType === "TEXT" && template.headerText) {
    components.push({ type: "HEADER", format: "TEXT", text: template.headerText });
  } else if (
    (template.headerType === "IMAGE" || template.headerType === "VIDEO" || template.headerType === "DOCUMENT") &&
    (template.headerHandle || template.headerMediaUrl)
  ) {
    // Meta wants a handle from its own upload API here, not a link. This sent
    // header_url instead, which it rejects with "Missing sample parameter for
    // title type" — so every template with an image header quietly stayed a
    // draft. header_url is kept only as the fallback for callers that build
    // components for preview and never submit them.
    components.push({
      type: "HEADER",
      format: template.headerType,
      example: template.headerHandle
        ? { header_handle: [template.headerHandle] }
        : { header_url: [template.headerMediaUrl] },
    });
  }

  const bodyComponent: MetaComponent = { type: "BODY", text: template.bodyText };
  if (template.bodyExamples.length > 0) {
    bodyComponent.example = { body_text: [template.bodyExamples] };
  }
  components.push(bodyComponent);

  if (template.footerText) {
    components.push({ type: "FOOTER", text: template.footerText });
  }

  if (template.ctaButtons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: template.ctaButtons.map((b) => {
        if (b.type === "URL") {
          const dynamic = b.url?.includes("{{1}}");
          return dynamic
            ? { type: "URL", text: b.text, url: b.url, example: [b.example ?? b.url!.replace("{{1}}", "sample")] }
            : { type: "URL", text: b.text, url: b.url };
        }
        if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phoneNumber };
        return { type: "QUICK_REPLY", text: b.text };
      }),
    });
  }

  return components;
}

export interface MetaSubmissionResult {
  submitted: boolean;
  wabaTemplateId?: string;
  status?: string;
  error?: string;
}

/**
 * Actually submits the template to WhatsApp for approval, via
 * POST /{waba-id}/message_templates. Gracefully no-ops (submitted: false)
 * if WHATSAPP_WABA_ID/WHATSAPP_ACCESS_TOKEN aren't configured yet — the
 * template still saves locally as a draft either way.
 */
/**
 * Hand Meta a copy of the header media and get back the handle it wants as the
 * template's sample.
 *
 * Two calls: open an upload session against the app, then push the bytes into
 * it. The second one authenticates with "OAuth", not "Bearer" — Meta's
 * resumable upload endpoint rejects the usual scheme.
 */
async function uploadHeaderSample(
  url: string,
  accessToken: string,
  appId: string,
): Promise<{ handle?: string; error?: string }> {
  try {
    const file = await fetch(url);
    if (!file.ok) return { error: `Could not read the header media (HTTP ${file.status})` };

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.headers.get("content-type") ?? "image/jpeg";

    const session = await fetch(
      `https://graph.facebook.com/v21.0/${appId}/uploads` +
        `?file_length=${bytes.byteLength}&file_type=${encodeURIComponent(mime)}` +
        `&access_token=${accessToken}`,
      { method: "POST" },
    );
    const sessionData = (await session.json().catch(() => null)) as
      | { id?: string; error?: { message?: string } }
      | null;

    if (!session.ok || !sessionData?.id) {
      return { error: sessionData?.error?.message ?? `Upload session failed (HTTP ${session.status})` };
    }

    const upload = await fetch(`https://graph.facebook.com/v21.0/${sessionData.id}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${accessToken}`,
        file_offset: "0",
        "content-type": mime,
      },
      body: bytes,
    });
    const uploadData = (await upload.json().catch(() => null)) as
      | { h?: string; error?: { message?: string } }
      | null;

    if (!upload.ok || !uploadData?.h) {
      return { error: uploadData?.error?.message ?? `Upload failed (HTTP ${upload.status})` };
    }

    return { handle: uploadData.h };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const MEDIA_HEADERS = ["IMAGE", "VIDEO", "DOCUMENT"];

export async function submitTemplateToMeta(template: TemplateData): Promise<MetaSubmissionResult> {
  const wabaId = process.env.WHATSAPP_WABA_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const appId = process.env.WHATSAPP_APP_ID;

  if (!wabaId || !accessToken) {
    return { submitted: false, error: "WHATSAPP_WABA_ID / WHATSAPP_ACCESS_TOKEN not configured" };
  }

  let headerHandle: string | null = null;
  if (MEDIA_HEADERS.includes(template.headerType) && template.headerMediaUrl) {
    if (!appId) {
      return { submitted: false, error: "WHATSAPP_APP_ID is needed to upload the header sample" };
    }
    const sample = await uploadHeaderSample(template.headerMediaUrl, accessToken, appId);
    if (!sample.handle) {
      return { submitted: false, error: `Header image could not be uploaded — ${sample.error}` };
    }
    headerHandle = sample.handle;
  }

  const body = {
    name: template.providerTemplateName,
    category: template.wabaCategory,
    language: template.language,
    components: buildMetaComponents({ ...template, headerHandle }),
  };

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          id?: string;
          status?: string;
          error?: { message?: string; error_user_title?: string; error_user_msg?: string };
        }
      | null;

    if (!response.ok) {
      // Meta puts the actionable reason ("too many variables for its length",
      // "name already exists", ...) in error_user_msg and leaves `message` as a
      // generic "Invalid parameter" — surface the specific one when present.
      const err = data?.error;
      const detail = err?.error_user_msg
        ? `${err.error_user_title ?? "Rejected"}: ${err.error_user_msg}`
        : (err?.message ?? `HTTP ${response.status}`);
      return { submitted: false, error: detail };
    }

    return { submitted: true, wabaTemplateId: data?.id, status: data?.status ?? "PENDING" };
  } catch (error) {
    return { submitted: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Replace the components of a template Meta already has. The name stays, and
 * Meta puts the template back in review. The previously approved version can
 * still be sent until the edit is decided.
 */
export async function editTemplateOnMeta(
  wabaTemplateId: string,
  template: TemplateData,
): Promise<MetaSubmissionResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const appId = process.env.WHATSAPP_APP_ID;

  if (!accessToken) {
    return { submitted: false, error: "WHATSAPP_ACCESS_TOKEN not configured" };
  }

  let headerHandle: string | null = null;
  if (MEDIA_HEADERS.includes(template.headerType) && template.headerMediaUrl) {
    if (!appId) {
      return { submitted: false, error: "WHATSAPP_APP_ID is needed to upload the header sample" };
    }
    const sample = await uploadHeaderSample(template.headerMediaUrl, accessToken, appId);
    if (!sample.handle) {
      return { submitted: false, error: `Header image could not be uploaded — ${sample.error}` };
    }
    headerHandle = sample.handle;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${wabaTemplateId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        components: buildMetaComponents({ ...template, headerHandle }),
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
          id?: string;
          success?: boolean;
          status?: string;
          error?: { message?: string; error_user_title?: string; error_user_msg?: string };
        }
      | null;

    if (!response.ok) {
      const err = data?.error;
      const detail = err?.error_user_msg
        ? `${err.error_user_title ?? "Rejected"}: ${err.error_user_msg}`
        : (err?.message ?? `HTTP ${response.status}`);
      return { submitted: false, error: detail };
    }

    return { submitted: true, wabaTemplateId: data?.id ?? wabaTemplateId, status: data?.status ?? "PENDING" };
  } catch (error) {
    return { submitted: false, error: error instanceof Error ? error.message : String(error) };
  }
}
