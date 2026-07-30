/**
 * /api/treasuries — multi-treasury workspace routes.
 * Pro / Ultimate only (requirePaidTier).
 *
 * GET    /       → { treasuries[], activeTreasuryId }
 * PUT    /       → replace workspace (migration / bulk import)
 * POST   /       → create one
 * PUT    /active → set activeTreasuryId
 * PATCH  /:id    → rename
 * DELETE /:id    → remove
 */
import { Router } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { requirePaidTier } from '../auth/middleware/requirePaidTier';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  listTreasuries,
  createTreasury,
  patchTreasury,
  deleteTreasury,
  setActiveTreasury,
  replaceTreasuries,
} from './controllers/treasuryController';
import {
  createTreasuryBodySchema,
  patchTreasuryBodySchema,
  setActiveTreasuryBodySchema,
  replaceTreasuriesBodySchema,
  treasuryIdParamsSchema,
} from './schemas/treasurySchemas';

const router = Router();

router.use(requireAuth, requirePaidTier);

router.get('/', listTreasuries);
router.put('/', validateRequest({ body: replaceTreasuriesBodySchema }), replaceTreasuries);
router.post('/', validateRequest({ body: createTreasuryBodySchema }), createTreasury);
router.put(
  '/active',
  validateRequest({ body: setActiveTreasuryBodySchema }),
  setActiveTreasury,
);
router.patch(
  '/:id',
  validateRequest({ params: treasuryIdParamsSchema, body: patchTreasuryBodySchema }),
  patchTreasury,
);
router.delete(
  '/:id',
  validateRequest({ params: treasuryIdParamsSchema }),
  deleteTreasury,
);

export default router;
