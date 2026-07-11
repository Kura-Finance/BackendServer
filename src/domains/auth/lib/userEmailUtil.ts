/** Internal placeholder domain — satisfies NOT NULL until Privy links a real email. */
export const PLACEHOLDER_EMAIL_DOMAIN = 'placeholder.kura-finance.internal';

export function buildPlaceholderEmail(userId: string): string {
  return `${userId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

export function resolveUserEmail(userId: string, storedEmail: string | null | undefined): string {
  if (storedEmail) {
    return storedEmail;
  }
  return buildPlaceholderEmail(userId);
}
