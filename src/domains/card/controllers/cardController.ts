/**
 * Card Controllers (Gnosis Pay)
 *
 * GET  /api/card/status             → composite card + onboarding status
 * GET  /api/card/cards              → list GP cards
 * POST /api/card/cards/virtual      → issue virtual card
 * PATCH /api/card/cards/:cardId/freeze   → freeze card
 * PATCH /api/card/cards/:cardId/unfreeze → unfreeze card
 * GET  /api/card/transactions       → list transactions (from GP)
 */

import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import * as CardService from '../services/cardService';
import * as GnosisPayService from '../services/gnosisPayService';
import { appLogger } from '../../logger';

function handleGpError(err: unknown, res: Response): void {
  if (err instanceof GnosisPayService.GnosisPayError) {
    if (err.isUnauthorized) {
      sendError(res, 401, { code: 'GP_SESSION_EXPIRED', message: 'GP session expired. Please re-authenticate.' });
      return;
    }
    sendError(res, 502, { code: 'GP_API_ERROR', message: 'Gnosis Pay API error', details: err.gpBody });
    return;
  }
  appLogger.error('[Card Controller] Unexpected error', { error: err instanceof Error ? err.message : String(err) });
  sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

export async function getCardStatus(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const status = await CardService.getCardStatus(userId);
    sendSuccess(res, status);
  } catch (err) {
    appLogger.error('[CardController] getCardStatus error', { error: err });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
  }
}

export async function listCards(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const cards = await GnosisPayService.getCards(userId);
    sendSuccess(res, { cards });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function createVirtualCard(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const card = await GnosisPayService.createVirtualCard(userId);
    res.status(201).json({ data: { card } });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function freezeCard(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const cardId = Array.isArray(req.params.cardId) ? req.params.cardId[0] : req.params.cardId;
  if (!cardId) {
    sendError(res, 400, { code: 'VALIDATION_ERROR', message: 'cardId param required' });
    return;
  }
  try {
    await GnosisPayService.freezeCard(userId, cardId);
    sendSuccess(res, { success: true });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function unfreezeCard(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const cardId = Array.isArray(req.params.cardId) ? req.params.cardId[0] : req.params.cardId;
  if (!cardId) {
    sendError(res, 400, { code: 'VALIDATION_ERROR', message: 'cardId param required' });
    return;
  }
  try {
    await GnosisPayService.unfreezeCard(userId, cardId);
    sendSuccess(res, { success: true });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function getTransactions(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const transactions = await GnosisPayService.getTransactions(userId);
    sendSuccess(res, { transactions });
  } catch (err) {
    handleGpError(err, res);
  }
}
