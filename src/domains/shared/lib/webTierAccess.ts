/** Subscription tiers allowed on the web platform (Pro / Ultimate). */
export const WEB_ALLOWED_TIERS = new Set(['Pro', 'Ultimate']);

/**
 * Paths Basic web users may still hit (soft gate: login, profile, paid upgrade).
 * Full API paths including the `/api` prefix.
 */
export const WEB_TIER_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/stripe/checkout-session',
  '/api/stripe/billing-portal-session',
  '/api/stripe/billing-status',
  '/api/stripe/webhook',
  '/api/bridge/webhook',
  '/api/waitlist',
  '/api/waitlist/count',
  '/api/waitlist/status',
  '/api/platform-insights/records',
  '/api/platform-insights/summary',
  '/api/platform-insights/process-events',
  '/api/platform-insights/backfill',
  '/api/privy-analytics/sync',
  '/api/privy-analytics/summary',
  '/api/lifi-analytics/sync',
  '/api/lifi-analytics/summary',
]);

/** Prefixes exempt from web tier gate (admin APIs gated by requireAdmin instead). */
export const WEB_TIER_EXEMPT_PREFIXES = ['/api/admin'] as const;

export function tierHasWebAccess(tier: string): boolean {
  return WEB_ALLOWED_TIERS.has(tier);
}

export function getRequestApiPath(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

export function isWebTierExemptPath(fullPath: string): boolean {
  if (WEB_TIER_EXEMPT_PATHS.has(fullPath)) return true;
  return WEB_TIER_EXEMPT_PREFIXES.some(
    (prefix) => fullPath === prefix || fullPath.startsWith(`${prefix}/`),
  );
}
