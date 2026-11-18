// contact.phone has a single storage format, and it is not a cosmetic
// choice: Meta delivers an inbound WhatsApp `from` as digits with country
// code and no "+" (e.g. "919876543210"), and the webhook finds the contact
// with a plain equality match. Any write path that stores a different shape
// creates a second row for the same human and silently breaks inbound
// replies for them — which is exactly what happened before this was shared.

const DEFAULT_COUNTRY_CODE = "91";

export interface NormalizedPhone {
  ok: boolean;
  phone: string;
  error?: string;
}

export function normalizePhone(input: string): NormalizedPhone {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return { ok: false, phone: "", error: "Phone number is required" };

  // Bare local number, as typed off a form: assume the default country.
  if (digits.length === 10) return { ok: true, phone: DEFAULT_COUNTRY_CODE + digits };

  // Trunk-prefixed local number ("09876543210").
  if (digits.length === 11 && digits.startsWith("0")) {
    return { ok: true, phone: DEFAULT_COUNTRY_CODE + digits.slice(1) };
  }

  if (digits.length < 10 || digits.length > 15) {
    return { ok: false, phone: digits, error: `"${input}" is not a valid phone number` };
  }

  return { ok: true, phone: digits };
}

/** Convenience for call sites that just want the stored form or null. */
export function toStoredPhone(input?: string | null): string | null {
  if (!input) return null;
  const result = normalizePhone(input);
  return result.ok ? result.phone : null;
}
