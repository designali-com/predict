export interface SendParams {
  to: string; // phone (E.164) for whatsapp/sms, email address for email
  templateKey: string;
  providerTemplateName: string | null;
  /** The template's WABA language code, e.g. "en_US". */
  language?: string | null;
  variables: Record<string, unknown>;
  /** Positional values for {{1}}, {{2}}, ... — see template-body.ts. */
  templateParameters?: string[];
  /**
   * The template's header, when it has a media one. WhatsApp requires the
   * actual image/video/document with every send — approving the template with
   * a sample does not attach it — and rejects the send with "Parameter format
   * does not match format in the created template" if it is missing.
   */
  headerType?: string | null;
  headerMediaUrl?: string | null;
  ctaButtons?: unknown;
  /**
   * Values for link buttons whose URL ends in a variable ("…/l/{{1}}"), in
   * button order. Meta refuses the send without one per such button.
   */
  buttonParameters?: string[];
  /**
   * The template rendered with this send's values. WhatsApp ignores these —
   * Meta renders an approved template itself from templateParameters — but
   * email has no provider-side template, so without them an email send has
   * nothing to say beyond what the caller happened to put in variables.
   */
  renderedSubject?: string | null;
  renderedBody?: string | null;
  /**
   * The number to send from, when the contact's clinic has its own. Resolved
   * by sendCommunication; the adapter never looks a clinic up itself.
   */
  sender?: { phoneNumberId: string; accessToken: string } | null;
}

export interface SendResult {
  status: "sent" | "failed";
  providerMessageId?: string;
  error?: string;
}

export interface ChannelAdapter {
  send(params: SendParams): Promise<SendResult>;
}
