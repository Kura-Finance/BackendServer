/**
 * PSE Ephemeral Token Controller
 *
 * GET /api/card/gp/pse/token
 *
 * Returns a short-lived token for initialising @gnosispay/pse-sdk on the frontend.
 * PSE renders card PAN, CVV, and PIN change inside a secure Gnosis Pay iframe.
 *
 * Frontend usage:
 *   import GnosisPayPse from '@gnosispay/pse-sdk'
 *   const pse = new GnosisPayPse({ token, appId: PSE_APP_ID })
 *   await pse.showCardDetails(cardId, containerElement)
 */

import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { getEphemeralToken, isPseConfigured } from '../services/gnosisPayPseService';
import { requireJwt } from '../services/gnosisPayService';
import { appLogger } from '../../logger';

export async function getPseToken(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  if (!isPseConfigured()) {
    sendError(res, 503, {
      code: 'PSE_NOT_CONFIGURED',
      message: 'PSE not configured on this server. Contact support.',
    });
    return;
  }

  try {
    const gpJwt = await requireJwt(userId);
    const token = await getEphemeralToken(gpJwt);
    const appId = process.env.GNOSIS_PAY_PSE_APP_ID!;
    sendSuccess(res, { token, appId });
  } catch (err) {
    appLogger.error('[PSE Controller] Failed to fetch ephemeral token', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(res, 502, { code: 'PSE_TOKEN_FAILED', message: 'Failed to fetch PSE token' });
  }
}
