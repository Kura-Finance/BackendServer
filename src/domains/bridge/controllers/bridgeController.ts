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
    const structured = error.structuredBody;
    if (structured?.code === 'endorsement_required') {
      sendError(res, 409, {
        code: 'ENDORSEMENT_REQUIRED',
        message: structured.message ?? 'Additional Bridge endorsement is required.',
        details: {
          endorsement: structured.endorsement,
          currency: structured.currency,
        },
      });
      return;
    }

    // 4xx 直接透傳，5xx 收斂為 502（上游錯誤）
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502;
    const message = structured?.message ?? error.bridgeBody ?? fallbackMessage;
    sendError(res, status, {
      code: 'BRIDGE_API_ERROR',
      message,
      details: { bridgePath: error.path, bridgeBody: error.bridgeBody },
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

/** 既有 customer 申請額外 rail endorsement（BRL→pix、COP→cop 等）的 hosted flow。 */
export const createEndorsementLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { endorsement, currency, redirectUri } = req.body as {
      endorsement?: Parameters<typeof BridgeService.getEndorsementKycLink>[1];
      currency?: string;
      redirectUri?: string;
    };

    const result = currency
      ? await BridgeService.getEndorsementKycLinkForCurrency(userId, currency, redirectUri)
      : await BridgeService.getEndorsementKycLink(userId, endorsement!, redirectUri);

    sendSuccess(res, result);
  } catch (error) {
    logError('Bridge create endorsement link failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to create endorsement link');
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
    const { force } = req.query as { force?: boolean };
    const result = await BridgeService.listDeposits(userId, virtualAccountId, {
      ...(force ? { force: true } : {}),
    });
    sendSuccess(res, result);
  } catch (error) {
    logError('Bridge list deposits failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to list deposits');
  }
};

// ── Off-ramp（出金）───────────────────────────────────────────────────

export const listPayoutOptions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    sendSuccess(res, { options: BridgeService.listPayoutOptions() });
  } catch (error) {
    logError('Bridge list payout options failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to list payout options');
  }
};

export const getOrCreatePayoutAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.getOrCreatePayoutAddress(userId, req.body);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Bridge get/create payout address failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to get or create payout address');
  }
};

export const listPayoutAddresses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.listPayoutAddresses(userId);
    sendSuccess(res, { addresses: result, count: result.length });
  } catch (error) {
    logError('Bridge list payout addresses failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to list payout addresses');
  }
};

export const listPayoutDrains = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { liquidationAddressId } = req.params as { liquidationAddressId: string };
    const result = await BridgeService.listPayoutDrains(userId, liquidationAddressId);
    sendSuccess(res, { drains: result, count: result.length });
  } catch (error) {
    logError('Bridge list payout drains failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to list payout drains');
  }
};

/** 取得或建立永久 Tron USDT 入金地址（Liquidation Address → Base USDC SCA）。 */
export const getOrCreateCryptoDepositAddress = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.getOrCreateLiquidationAddress(userId, req.body);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Bridge get/create crypto deposit address failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to get or create crypto deposit address');
  }
};

export const listCryptoDepositAddresses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const result = await BridgeService.listLiquidationAddresses(userId);
    sendSuccess(res, { addresses: result, count: result.length });
  } catch (error) {
    logError('Bridge list crypto deposit addresses failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to list crypto deposit addresses');
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

export const deleteExternalAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { externalAccountId } = req.params as { externalAccountId: string };
    const result = await BridgeService.deleteExternalAccount(userId, externalAccountId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Bridge delete external account failed', error, { userId: req.userId });
    handleBridgeError(res, error, 'Failed to delete external account');
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
