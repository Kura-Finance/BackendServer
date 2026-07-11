import { Request, Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { CodegoError, CodegoService } from '../services/codegoService';
import {
  handleWebhookEvent,
  verifyWebhookSignature,
} from '../services/codegoWebhookService';
import type { CodegoWebhookPayload } from '../models/types';

function getAuthenticatedUserId(req: AuthRequest, res: Response): string | null {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return null;
  }
  return req.userId;
}

function handleCodegoError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof CodegoError) {
    const parsed = error.parsedBody;
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502;
    sendError(res, status, {
      code: 'CODEGO_API_ERROR',
      message: parsed?.message ?? fallbackMessage,
      details: { path: error.path, body: error.responseBody },
    });
    return;
  }
  const message = error instanceof Error ? error.message : fallbackMessage;
  sendError(res, 500, { code: 'INTERNAL_ERROR', message });
}

// ── Onboard ─────────────────────────────────────────────────────────

export const createKycSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await CodegoService.createKycSession(userId, req.body);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Codego create KYC session failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to create KYC session');
  }
};

export const getCardholderStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await CodegoService.getCardholderStatus(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego get cardholder status failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to fetch cardholder status');
  }
};

export const getApplication = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await CodegoService.getApplication(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego get application failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to fetch application');
  }
};

export const getUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await CodegoService.getUser(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego get user failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to fetch user');
  }
};

// ── Fund ────────────────────────────────────────────────────────────

export const getContracts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await CodegoService.getContracts(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego get contracts failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to fetch contracts');
  }
};

export const getBalances = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await CodegoService.getBalances(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego get balances failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to fetch balances');
  }
};

// ── Cards ───────────────────────────────────────────────────────────

export const issueCard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await CodegoService.issueCard(userId, req.body);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Codego issue card failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to issue card');
  }
};

export const listCards = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await CodegoService.listCards(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego list cards failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to list cards');
  }
};

export const getCard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { cardId } = req.params as { cardId: string };
    const result = await CodegoService.getCard(userId, cardId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego get card failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to fetch card');
  }
};

export const updateCard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { cardId } = req.params as { cardId: string };
    const result = await CodegoService.updateCard(userId, cardId, req.body);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego update card failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to update card');
  }
};

export const getCardSecrets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const sessionId = req.headers.sessionid as string | undefined;
    if (!sessionId) {
      sendError(res, 400, {
        code: 'MISSING_SESSION_ID',
        message: 'SessionId header is required for card secrets',
      });
      return;
    }

    const { cardId } = req.params as { cardId: string };
    const result = await CodegoService.getCardSecrets(userId, cardId, sessionId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego get card secrets failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to fetch card secrets');
  }
};

export const getCardPin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const sessionId = req.headers.sessionid as string | undefined;
    if (!sessionId) {
      sendError(res, 400, {
        code: 'MISSING_SESSION_ID',
        message: 'SessionId header is required for card PIN',
      });
      return;
    }

    const { cardId } = req.params as { cardId: string };
    const result = await CodegoService.getCardPin(userId, cardId, sessionId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego get card PIN failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to fetch card PIN');
  }
};

// ── Transactions ────────────────────────────────────────────────────

export const listTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { limit, offset } = req.query as { limit?: number; offset?: number };
    const query: { limit?: number; offset?: number } = {};
    if (limit !== undefined) query.limit = limit;
    if (offset !== undefined) query.offset = offset;
    const result = await CodegoService.listTransactions(userId, query);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego list transactions failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to list transactions');
  }
};

export const getTransaction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { txId } = req.params as { txId: string };
    const result = await CodegoService.getTransaction(userId, txId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Codego get transaction failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to fetch transaction');
  }
};

export const createDispute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { txId } = req.params as { txId: string };
    const result = await CodegoService.createDispute(userId, txId, req.body ?? {});
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Codego create dispute failed', error, { userId: req.userId });
    handleCodegoError(res, error, 'Failed to create dispute');
  }
};

// ── Webhook ─────────────────────────────────────────────────────────

export const handleCodegoWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers.signature;
  const idempotencyKey = req.headers['idempotency-key'];
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';

  const verification = verifyWebhookSignature(
    rawBody,
    typeof signature === 'string' ? signature : undefined,
  );

  if (!verification.valid) {
    sendError(res, 401, {
      code: 'INVALID_WEBHOOK_SIGNATURE',
      message: `Webhook signature verification failed: ${verification.reason}`,
    });
    return;
  }

  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
    sendError(res, 400, {
      code: 'MISSING_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key header is required',
    });
    return;
  }

  try {
    const event = req.body as CodegoWebhookPayload;
    await handleWebhookEvent(event, idempotencyKey);
    res.status(200).json({ received: true });
  } catch (error) {
    logError('Codego webhook processing failed', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};
