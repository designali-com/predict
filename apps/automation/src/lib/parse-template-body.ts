import type { TemplateButton, WabaCategory, HeaderType } from "./whatsapp-templates";

const WABA_CATEGORIES: WabaCategory[] = ["MARKETING", "UTILITY", "AUTHENTICATION"];
const HEADER_TYPES: HeaderType[] = ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"];

export interface ParsedTemplateBody {
  key: string;
  name: string;
  channel: string;
  category: string;
  providerTemplateName: string | null;
  wabaCategory: WabaCategory | null;
  language: string;
  headerType: HeaderType;
  headerText: string | null;
  headerMediaUrl: string | null;
  headerMediaType: string | null;
  bodyText: string | null;
  bodyExamples: string[];
  footerText: string | null;
  ctaButtons: TemplateButton[];
}

/** Shared field parsing for POST /api/templates and PUT /api/templates/[id]. */
export function parseTemplateBody(body: unknown): ParsedTemplateBody | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const key = typeof b.key === "string" ? b.key.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const channel = typeof b.channel === "string" ? b.channel : "whatsapp";

  if (!key || !name) {
    return { error: "key and name are required" };
  }

  const category = typeof b.category === "string" ? b.category : "transactional";
  const providerTemplateName =
    typeof b.providerTemplateName === "string" && b.providerTemplateName ? b.providerTemplateName : null;
  const wabaCategory = WABA_CATEGORIES.includes(b.wabaCategory as WabaCategory)
    ? (b.wabaCategory as WabaCategory)
    : null;
  const language = typeof b.language === "string" && b.language ? b.language : "en_US";
  const headerType = HEADER_TYPES.includes(b.headerType as HeaderType) ? (b.headerType as HeaderType) : "NONE";
  const headerText = typeof b.headerText === "string" && b.headerText ? b.headerText : null;
  const headerMediaUrl = typeof b.headerMediaUrl === "string" && b.headerMediaUrl ? b.headerMediaUrl : null;
  const headerMediaType = typeof b.headerMediaType === "string" && b.headerMediaType ? b.headerMediaType : null;
  const bodyText = typeof b.bodyText === "string" ? b.bodyText : null;
  const bodyExamples = Array.isArray(b.bodyExamples)
    ? b.bodyExamples.filter((v): v is string => typeof v === "string")
    : [];
  const footerText = typeof b.footerText === "string" && b.footerText ? b.footerText : null;
  const ctaButtons = Array.isArray(b.ctaButtons)
    ? (b.ctaButtons as TemplateButton[]).filter((btn) => btn && typeof btn.text === "string")
    : [];

  return {
    key,
    name,
    channel,
    category,
    providerTemplateName,
    wabaCategory,
    language,
    headerType,
    headerText,
    headerMediaUrl,
    headerMediaType,
    bodyText,
    bodyExamples,
    footerText,
    ctaButtons,
  };
}
