/**
 * Mobile-only patient logins carry a placeholder email, because better-auth
 * needs one on every account. It is on a reserved domain (.invalid can never
 * be a real mailbox), is never shown to anybody, and is never accepted as a
 * sign-in email. No imports: client components use this too.
 */

const PLACEHOLDER_DOMAIN = "phone.predict.invalid";

export function placeholderEmailFor(phone: string): string {
  return `p${phone}@${PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`));
}

/** The email to show — nothing, when the account's is the placeholder. */
export function visibleEmail(email: string | null | undefined): string | null {
  return email && !isPlaceholderEmail(email) ? email : null;
}
