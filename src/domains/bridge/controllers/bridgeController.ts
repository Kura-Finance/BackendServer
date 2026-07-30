/**
 * Bridge HTTP controllers (KYC, on/off-ramp, external accounts, webhook).
 */

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

/** Map BridgeError to HTTP status and response body. */
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

    // Pass through 4xx; collapse 5xx to 502 (upstream)
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

/** Hosted flow for an existing customer to request an extra rail endorsement (e.g. BRL→pix). */
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

// ── On-ramp (fiat → crypto): Virtual Accounts ───────────────────────

/** Get or create the user's deposit Virtual Account; returns fiat deposit bank details. */
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

/** List the user's deposit Virtual Accounts. */
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
 * List deposit history (for client polling).
 * - GET /onramp/:virtualAccountId/deposits → deposits for one VA
 * - GET /deposits → all deposits for the user
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

// ── Off-ramp ────────────────────────────────────────────────────────

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

/** Get or create a permanent Tron USDT deposit address (LA → Base USDC SCA). */
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
    // 400 so Bridge retries (timestamp skew / config issues)
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
    // 500 so Bridge retries on processing failure
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};
