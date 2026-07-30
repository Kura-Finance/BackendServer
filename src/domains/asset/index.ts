/**
 * Asset domain public exports.
 * Tracks encrypted per-metric asset history (Phase 3 Zero-Access E2EE).
 */
export { default as assetRouter } from './router';
export { AssetService } from './services/assetService';
export type { AssetHistoryResponse } from './models/types';
