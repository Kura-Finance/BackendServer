/** Web 平台允許使用的訂閱等級（Pro / Ultimate 功能；VIP 一併放行） */
export const WEB_ALLOWED_TIERS = new Set(['Pro', 'Ultimate', 'VIP']);

/**
 * Basic 用戶在 Web 仍可存取的路徑（soft gate：可登入、查 profile、付費升級）
 * 使用完整 API path（含 /api 前綴）
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
]);

export function tierHasWebAccess(tier: string): boolean {
  return WEB_ALLOWED_TIERS.has(tier);
}

export function getRequestApiPath(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

export function isWebTierExemptPath(fullPath: string): boolean {
  return WEB_TIER_EXEMPT_PATHS.has(fullPath);
}
