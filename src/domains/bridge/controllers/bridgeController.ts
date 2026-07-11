import { Request, Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { BridgeError, BridgeService } from '../services/bridgeService';
import {
  BridgeWebhookEvent,
  handleWebhookEvent,
  verifyWebhookSignature,
} from '../services/bridgeWebhookService';

function getAuthenticatedUserId(req: AuthRequest, res: Response): string | null {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return null;
  }
  return req.userId;
}

/** 將 BridgeError 對應到 HTTP 狀態與訊息。 */
function handleBridgeError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof BridgeError) {
    // 4xx 直接透傳，5xx 收斂為 502（上游錯誤）
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502;
    sendError(res, status, {
      code: 'BRIDGE_API_ERROR',
      message: error.message,
      details: error.bridgeBody,
    });
    return;
  }
  const message = error instanceof Error ? error.message : fallbackMessage;
  sendError(res, 500, { code: 'INTERNAL_ERROR', message });
}

// ── KYC / Customer ──────────────────────────────────────────────────

export const createKycLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.getOrCreateKycLink(userId, req.body);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Bridge create KYC link failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to create KYC link');
  }
};

export const getCustomerStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.getCustomerStatus(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Bridge get customer status failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to fetch customer status');
  }
};

// ── On-ramp（入金）：Virtual Accounts ────────────────────────────────

/** 取得或建立使用者的入金 Virtual Account，回傳專屬法幣入金銀行資訊。 */
export const createOnRamp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.getOrCreateVirtualAccount(userId, req.body);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Bridge create on-ramp virtual account failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to create on-ramp virtual account');
  }
};

/** 列出使用者的入金 Virtual Accounts。 */
export const listVirtualAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.listVirtualAccounts(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Bridge list virtual accounts failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to list virtual accounts');
  }
};

/**
 * 列出入金紀錄（供前端輪詢）。
 * - GET /onramp/:virtualAccountId/deposits → 指定 VA 的入金
 * - GET /deposits → 使用者所有入金
 */
export const listDeposits = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { virtualAccountId } = req.params as { virtualAccountId?: string };
    const result = await BridgeService.listDeposits(userId, virtualAccountId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Bridge list deposits failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to list deposits');
  }
};

// ── Off-ramp（出金）───────────────────────────────────────────────────

export const createOffRamp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.createOffRamp(userId, req.body);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Bridge create off-ramp failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to create off-ramp transfer');
  }
};

export const getTransfer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { transferId } = req.params as { transferId: string };
    const result = await BridgeService.getTransfer(userId, transferId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Bridge get transfer failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to fetch transfer');
  }
};

export const listTransfers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.listTransfers(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Bridge list transfers failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to list transfers');
  }
};

// ── External Accounts ───────────────────────────────────────────────

export const createExternalAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.createExternalAccount(userId, req.body);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Bridge create external account failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to create external account');
  }
};

export const listExternalAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.listExternalAccounts(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Bridge list external accounts failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to list external accounts');
  }
};

// ── Webhook ─────────────────────────────────────────────────────────

export const handleBridgeWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-webhook-signature'];
  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';

  const verification = verifyWebhookSignature(
    rawBody,
    typeof signature === 'string' ? signature : undefined,
  );

  if (!verification.valid) {
    // 回 400 讓 Bridge 重送（含 timestamp 容忍與設定問題）
    sendError(res, 400, {
      code: 'INVALID_WEBHOOK_SIGNATURE',
      message: `Webhook signature verification failed: ${verification.reason}`,
    });
    return;
  }

  try {
    const event = req.body as BridgeWebhookEvent;
    await handleWebhookEvent(event);
    res.status(200).json({ received: true });
  } catch (error) {
    logError('Bridge webhook processing failed', error);
    // 處理失敗回 500 讓 Bridge 重送
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};
