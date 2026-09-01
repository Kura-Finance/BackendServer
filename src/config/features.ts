/**
 * Domain feature flags — edit this file to enable/disable optional domains.
 *
 * Core domains (auth, assets) are always on.
 * When a feature is off: skip its env key validation and do not mount its routes.
 *
 * Snapshot: GET /api/features  ·  also included in GET /health
 */

import { Request, Response, NextFunction } from 'express';

/** Optional product domains that can be toggled. */
export const FEATURE_NAMES = [
  'email',
  'plaid',
  'exchange',
  'notifications',
  'debank',
  'stripe',
  'wallet',
  'treasury',
  'bridge',
  'dinari',
  'waitlist',
  'platformInsights',
  'privyAnalytics',
  'lifiAnalytics',
  'admin',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

/** Always-on domains. */
export const CORE_FEATURES = ['auth', 'assets'] as const;
export type CoreFeatureName = (typeof CORE_FEATURES)[number];

/**
 * Toggle optional domains here (true = mount routes + require partner keys).
 * This map is Kura production. Forks: disable domains you do not have keys for.
 */
export const FEATURES: Record<FeatureName, boolean> = {
  email: true,
  plaid: true,
  exchange: true,
  notifications: true,
  debank: true,
  stripe: true,
  wallet: true,
  treasury: true,
  bridge: true,
  dinari: true,
  waitlist: true,
  platformInsights: true,
  privyAnalytics: true,
  lifiAnalytics: true,
  admin: true,
};

/** Whether an optional domain feature is enabled. */
export function isFeatureEnabled(name: FeatureName): boolean {
  return FEATURES[name] === true;
}

/** Snapshot of all feature flags (core + optional). */
export function getFeatureFlags(): Record<CoreFeatureName | FeatureName, boolean> {
  return {
    auth: true,
    assets: true,
    ...FEATURES,
  };
}

/** Express middleware — 503 when the feature is disabled. */
export function requireFeature(name: FeatureName) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!isFeatureEnabled(name)) {
      res.status(503).json({
        error: 'Feature disabled',
        feature: name,
      });
      return;
    }
    next();
  };
}

/** Log enabled/disabled domains once at boot. */
export function logFeatureFlags(): void {
  const flags = getFeatureFlags();
  const enabled = Object.entries(flags)
    .filter(([, on]) => on)
    .map(([k]) => k);
  const disabled = Object.entries(flags)
    .filter(([, on]) => !on)
    .map(([k]) => k);
  console.log(`🚩 Features enabled: ${enabled.join(', ') || '(none)'}`);
  if (disabled.length > 0) {
    console.log(`🚩 Features disabled: ${disabled.join(', ')}`);
  }
}
