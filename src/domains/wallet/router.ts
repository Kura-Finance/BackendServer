/**
 * /api/wallet
 *
 * GET  /    → current wallet info { walletAddress, scaAddress }
 * PUT  /sca → update SCA (ERC-4337 Smart Contract Account) address
 * PUT  /eoa → update EOA (Privy embedded wallet) address
 */
import { Router } from 'express';
import { requireAuth } from '../auth/middleware/auth';
import { validateRequest } from '../shared/middleware/validateRequest';
import { getWallet, updateSca, updateEoa } from './controllers/walletController';
import { updateScaBodySchema, updateEoaBodySchema } from './schemas/walletSchemas';

const router = Router();

router.get('/', requireAuth, getWallet);
router.put('/sca', requireAuth, validateRequest({ body: updateScaBodySchema }), updateSca);
router.put('/eoa', requireAuth, validateRequest({ body: updateEoaBodySchema }), updateEoa);

export default router;
