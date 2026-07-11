/**
 * /api/wallet
 *
 * GET  /           → 取得目前錢包資訊 { walletAddress, scaAddress }
 * PUT  /sca        → 更新 SCA（ERC-4337 Smart Contract Account）地址
 * PUT  /eoa        → 更新 EOA（Privy embedded wallet）地址
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
