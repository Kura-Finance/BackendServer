/**
 * Gnosis Pay SIWE Authentication Controllers
 *
 * GET  /api/card/gp/nonce     → get SIWE nonce from GP
 * POST /api/card/gp/auth      → submit signed SIWE → store GP JWT
 * POST /api/card/gp/signup    → register with GP (email, partnerId)
 * POST /api/card/gp/terms     → accept GP Terms of Service
 * GET  /api/card/gp/status    → get GP user status + sync to DB
 */

import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import * as GnosisPayService from '../services/gnosisPayService';
import { appLogger } from '../../logger';

function handleGpError(err: unknown, res: Response): void {
  if (err instanceof GnosisPayService.GnosisPayError) {
    if (err.isUnauthorized) {
      sendError(res, 401, { code: 'GP_SESSION_EXPIRED', message: 'GP session expired. Please re-authenticate.' });
      return;
    }
    if (err.isConflict) {
      sendError(res, 409, { code: 'GP_CONFLICT', message: err.gpBody });
      return;
    }
    sendError(res, 502, { code: 'GP_API_ERROR', message: 'Gnosis Pay API error', details: err.gpBody });
    return;
  }
  appLogger.error('[GP Controller] Unexpected error', { error: err instanceof Error ? err.message : String(err) });
  sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

export async function getNonce(req: AuthRequest, res: Response): Promise<void> {
  const { address } = req.query as { address?: string };
  if (!address) {
    sendError(res, 400, { code: 'VALIDATION_ERROR', message: 'address query param required' });
    return;
  }
  try {
    const data = await GnosisPayService.getNonce(address);
    sendSuccess(res, data);
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function authenticate(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { message, signature } = req.body as { message: string; signature: string };
  try {
    const result = await GnosisPayService.authenticate(userId, message, signature);
    sendSuccess(res, { address: result.address });
  } catch (err) {
    appLogger.warn('[GPAuthController] SIWE auth failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    handleGpError(err, res);
  }
}

export async function signUp(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { email } = req.body as { email?: string };
  try {
    await GnosisPayService.signUp(userId, email);
    sendSuccess(res, { success: true });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function getTerms(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const terms = await GnosisPayService.getTerms(userId);
    sendSuccess(res, { terms });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function acceptTerms(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  // Optionally accept a specific subset; otherwise auto-accepts all pending terms
  const { terms } = req.body as { terms?: GnosisPayService.GpTerm[] };
  try {
    await GnosisPayService.acceptTerms(userId, terms);
    sendSuccess(res, { success: true });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function getGpStatus(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const status = await GnosisPayService.getUserStatus(userId);
    sendSuccess(res, status);
  } catch (err) {
    handleGpError(err, res);
  }
}
