/**
 * Placeholder email helpers until Privy links a real address.
 */

/** Internal placeholder domain — satisfies NOT NULL until Privy links a real email. */
export const PLACEHOLDER_EMAIL_DOMAIN = 'placeholder.kura-finance.internal';

/** Build `{userId}@placeholder…` when no real email exists. */
export function buildPlaceholderEmail(userId: string): string {
  return `${userId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/** Whether the address is an internal placeholder. */
export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** Prefer stored email; otherwise return a placeholder for the user. */
export function resolveUserEmail(userId: string, storedEmail: string | null | undefined): string {
  if (storedEmail) {
    return storedEmail;
  }
  return buildPlaceholderEmail(userId);
}
