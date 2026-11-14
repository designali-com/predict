// Moved to @workspace/db so apps/web writes contact.phone in the same shape
// — the two apps disagreeing on format is what created duplicate contacts.
export { normalizePhone, toStoredPhone } from "@workspace/db/normalize-phone";
export type { NormalizedPhone } from "@workspace/db/normalize-phone";
