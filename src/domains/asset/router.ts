/**
 * Asset routes (all require auth) — Phase 3 Zero-Access E2EE only.
 *
 * Since PR 5, all asset history is encrypted.
 * `/history` is kept as a compatibility alias of `/history/encrypted`.
 */
import { Router } from 'express';
import {
  getEncryptedAssetHistory,
  getRecordDates,
} from './controllers/assetController';
import { requireAuth } from '../auth/middleware/auth';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  getAssetHistoryQuerySchema,
} from './schemas/assetSchemas';

const router = Router();

// Encrypted asset history (canonical path + legacy alias).
// Query: ?days=30 (default 30; Basic max 30, paid tiers max 365).
router.get(
  ['/history/encrypted', '/history'],
  requireAuth,
  validateRequest({ query: getAssetHistoryQuerySchema }),
  getEncryptedAssetHistory,
);

// Distinct recordedAt dates (metadata only).
router.get('/dates', requireAuth, getRecordDates);

export default router;
