import { Response } from 'express';
import { APIError } from '@dinari/api-sdk';
import { AuthRequest } from '../../auth/middleware/auth';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { formatDinariFieldErrors } from '../lib/dinariWalletUtil';
import { DinariError, DinariService } from '../services/dinariService';

function dinariErrorLogContext(error: unknown): Record<string, unknown> {
  if (!(error instanceof APIError)) return {};
  const body = (error as { error?: unknown }).error;
  return {
    dinariStatus: error.status,
    dinariDetails: body,
    dinariFieldSummary: formatDinariFieldErrors(body),
  };
}

function getAuthenticatedUserId(req: AuthRequest, res: Response): string | null {
  if (!req.userId) {
    sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return null;
  }
  return req.userId;
}

/** 將 DinariError / SDK APIError 對應到 HTTP 回應。 */
function handleDinariError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof DinariError) {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 502;
    sendError(res, status, { code: 'DINARI_ERROR', message: error.message });
    return;
  }
  if (error instanceof APIError) {
    const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 502;
    const dinariError = (error as { error?: unknown }).error;
    const fieldSummary = formatDinariFieldErrors(dinariError);
    const message = fieldSummary ? `${error.message}: ${fieldSummary}` : error.message;
    sendError(res, status, {
      code: 'DINARI_API_ERROR',
      message,
      details: dinariError,
    });
    return;
  }
  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (
      normalized.includes('walletaddress') ||
      normalized.includes('chainid') ||
      normalized.includes('unsupported chain')
    ) {
      sendError(res, 400, { code: 'INVALID_REQUEST', message: error.message });
      return;
    }
  }
  const message = error instanceof Error ? error.message : fallbackMessage;
  sendError(res, 500, { code: 'INTERNAL_ERROR', message });
}

// ── KYC / Entity ────────────────────────────────────────────────────

export const getEntityStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const result = await DinariService.getEntityStatus(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari get entity status failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to fetch entity status');
  }
};

export const createKycEmbed = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const result = await DinariService.createKycEmbed(userId, req.body?.name);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Dinari create KYC embed failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to create KYC embed');
  }
};

// ── Account / Wallet ────────────────────────────────────────────────

export const getAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const result = await DinariService.getOrCreateAccount(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari get account failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to fetch account');
  }
};

export const getWalletNonce = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const result = await DinariService.getWalletNonce(
      userId,
      req.body.walletAddress,
      req.body.chainId,
    );
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari get wallet nonce failed', error, {
      userId: req.userId,
      walletAddress: req.body?.walletAddress,
      chainId: req.body?.chainId,
      ...dinariErrorLogContext(error),
    });
    handleDinariError(res, error, 'Failed to get wallet nonce');
  }
};

export const connectWallet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const result = await DinariService.connectWallet(userId, req.body);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Dinari connect wallet failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to connect wallet');
  }
};

// ── 行情 ──────────────────────────────────────────────────────────────

export const listStocks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const result = await DinariService.listStocks(
      req.query as unknown as { symbols?: string; page?: number; pageSize?: number },
    );
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari list stocks failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to list stocks');
  }
};

export const getStockPrice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const { stockId } = req.params as { stockId: string };
    const result = await DinariService.getStockPrice(stockId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari get stock price failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to fetch stock price');
  }
};

export const getStockQuote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const { stockId } = req.params as { stockId: string };
    const result = await DinariService.getStockQuote(stockId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari get stock quote failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to fetch stock quote');
  }
};

// ── 下單 ──────────────────────────────────────────────────────────────

export const prepareOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const { side, stockId, paymentTokenQuantity, assetTokenQuantity, clientOrderId } = req.body;
    const result = await DinariService.prepareMarketOrder(userId, {
      side,
      stockId,
      ...(paymentTokenQuantity !== undefined ? { paymentTokenQuantity: Number(paymentTokenQuantity) } : {}),
      ...(assetTokenQuantity !== undefined ? { assetTokenQuantity: Number(assetTokenQuantity) } : {}),
      ...(clientOrderId ? { clientOrderId } : {}),
    });
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Dinari prepare order failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to prepare order');
  }
};

export const submitOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const { orderRequestId, permitSignature } = req.body;
    const result = await DinariService.submitOrder(userId, orderRequestId, permitSignature);
    sendSuccess(res, result, 201);
  } catch (error) {
    logError('Dinari submit order failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to submit order');
  }
};

export const listOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const result = await DinariService.listOrders(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari list orders failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to list orders');
  }
};

export const getOrderRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const { orderRequestId } = req.params as { orderRequestId: string };
    const result = await DinariService.syncOrderRequest(userId, orderRequestId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari get order request failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to fetch order request');
  }
};

export const getOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const { orderId } = req.params as { orderId: string };
    const result = await DinariService.syncOrder(userId, orderId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari get order failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to fetch order');
  }
};

// ── 持倉 / 現金 / Sandbox ────────────────────────────────────────────

export const getPortfolio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const result = await DinariService.getPortfolio(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari get portfolio failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to fetch portfolio');
  }
};

export const getCashBalances = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    const result = await DinariService.getCashBalances(userId);
    sendSuccess(res, result);
  } catch (error) {
    logError('Dinari get cash balances failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to fetch cash balances');
  }
};

export const mintSandboxTokens = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    await DinariService.mintSandboxTokens(userId);
    sendSuccess(res, { minted: true }, 201);
  } catch (error) {
    logError('Dinari mint sandbox tokens failed', error, { userId: req.userId });
    handleDinariError(res, error, 'Failed to mint sandbox tokens');
  }
};
