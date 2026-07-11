import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { DeBankService } from '../services/debankService';
import { logError } from '../../logger';
import type { GetProtocolsQuery } from '../schemas/debankSchemas';
import type { UnlinkAddressParams } from '../schemas/debankSchemas';
import type { DeBankTokenPosition } from '../models/types';
import { getStockLogoUrl } from '../../shared/lib/symbolsAndExchangesUtil';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatTokenPortfolio(tokens: DeBankTokenPosition[]) {
  const balances = tokens.map((token) => {
    const total = toNumber(token.amount);
    const usdPrice = toNumber(token.price);
    const fallbackUsdValue = total * usdPrice;
    const usdValue = toNumber(token.usd_value) || fallbackUsdValue;
    const symbol = (token.symbol || token.name || 'UNKNOWN').toUpperCase();

    return {
      symbol,
      free: total,
      used: 0,
      total,
      logo: token.logo_url || getStockLogoUrl(symbol),
      usdPrice,
      change24h: 0, // DeBank token endpoint 不提供統一的 24h 變化欄位
      usdValue,
      chain: token.chain || 'unknown',
      name: token.name || symbol,
    };
  });

  const assets = balances.filter((token) => token.free > 0);
  const balancesUsdTotal = balances.reduce((sum, token) => sum + token.usdValue, 0);
  const assetsUsdTotal = assets.reduce((sum, token) => sum + token.usdValue, 0);

  return {
    balances,
    balancesUsdTotal,
    assets,
    assetsUsdTotal,
    positions: [],
    positionsUsdTotal: 0,
    totalUsdValue: balancesUsdTotal,
  };
}

/**
 * 取得使用者在 DeBank 的協議資料
 * 路由：GET /api/debank/protocols?address=0x...
 */
export const getUserProtocolPositions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const { address, refresh } = req.query as unknown as GetProtocolsQuery;
    const forceRefresh = refresh ?? false;
    const result = await DeBankService.getUserProtocolPositions(req.userId, address, forceRefresh);
    sendSuccess(res, {
      address,
      protocols: result.protocols,
      total: result.protocols.length,
      fromCache: result.fromCache,
      cachedAt: result.cachedAt,
    });
  } catch (error) {
    logError('Get DeBank protocol positions failed', error, {
      userId: req.userId,
      address: req.query.address,
    });

    const message = error instanceof Error ? error.message : 'Failed to fetch protocol positions';
    const normalized = message.toLowerCase();
    const isValidationError = normalized.includes('address');
    const isConfigurationError = normalized.includes('configured');
    const isUpstreamError = normalized.includes('debank api request failed');

    const refreshRequested = String(req.query.refresh || '').toLowerCase() === 'true';
    const isLimitError = (error as any)?.statusCode === 429;

    // 與 Plaid 一致：手動刷新達限時，回退為快取資料回傳
    if (refreshRequested && isLimitError && req.userId) {
      try {
        const address = String(req.query.address || '').trim();
        const cached = await DeBankService.getUserProtocolPositions(req.userId, address, false);
        sendSuccess(res, {
          address,
          protocols: cached.protocols,
          total: cached.protocols.length,
          fromCache: true,
          cachedAt: cached.cachedAt,
        }, 200, {
          limitReached: true,
          message,
        });
        return;
      } catch {
        sendError(res, 429, {
          code: 'RATE_LIMITED',
          message,
          details: {
            refreshLimit: (error as any)?.refreshLimit,
            refreshCountRemaining: (error as any)?.refreshCountRemaining ?? 0,
            retryAfter: 86400,
          },
        });
        return;
      }
    }

    const statusCode = isValidationError
      ? 400
      : isConfigurationError
      ? 503
      : isUpstreamError
      ? 502
      : isLimitError
      ? 429
      : 500;
    sendError(res, statusCode, {
      code: isValidationError
        ? 'VALIDATION_ERROR'
        : isConfigurationError
        ? 'SERVICE_UNAVAILABLE'
        : isUpstreamError
        ? 'UPSTREAM_ERROR'
        : isLimitError
        ? 'RATE_LIMITED'
        : 'INTERNAL_ERROR',
      message,
    });
  }
};

/**
 * 取得使用者在 DeBank 的 EVM Token 持倉
 * 路由：GET /api/debank/tokens?address=0x...
 */
export const getUserTokenPositions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const { address, refresh } = req.query as unknown as GetProtocolsQuery;
    const forceRefresh = refresh ?? false;
    const result = await DeBankService.getUserTokenPositions(req.userId, address, forceRefresh);
    const portfolio = formatTokenPortfolio(result.tokens);

    sendSuccess(res, {
      account: {
        id: address.toLowerCase(),
        exchange: 'debank',
        displayName: 'DeBank EVM Wallet',
        walletAddress: address.toLowerCase(),
      },
      ...portfolio,
      tokenCount: result.tokens.length,
      fromCache: result.fromCache,
      cachedAt: result.cachedAt,
      timestamp: result.cachedAt || new Date().toISOString(),
    });
  } catch (error) {
    logError('Get DeBank token positions failed', error, {
      userId: req.userId,
      address: req.query.address,
    });

    const message = error instanceof Error ? error.message : 'Failed to fetch token positions';
    const normalized = message.toLowerCase();
    const isValidationError = normalized.includes('address');
    const isConfigurationError = normalized.includes('configured');
    const isUpstreamError = normalized.includes('debank api request failed');

    const refreshRequested = String(req.query.refresh || '').toLowerCase() === 'true';
    const isLimitError = (error as any)?.statusCode === 429;

    // 與 Plaid 一致：手動刷新達限時，回退為快取資料回傳
    if (refreshRequested && isLimitError && req.userId) {
      try {
        const address = String(req.query.address || '').trim();
        const cached = await DeBankService.getUserTokenPositions(req.userId, address, false);
        const portfolio = formatTokenPortfolio(cached.tokens);

        sendSuccess(res, {
          account: {
            id: address.toLowerCase(),
            exchange: 'debank',
            displayName: 'DeBank EVM Wallet',
            walletAddress: address.toLowerCase(),
          },
          ...portfolio,
          tokenCount: cached.tokens.length,
          fromCache: true,
          cachedAt: cached.cachedAt,
          timestamp: cached.cachedAt || new Date().toISOString(),
        }, 200, {
          limitReached: true,
          message,
        });
        return;
      } catch {
        sendError(res, 429, {
          code: 'RATE_LIMITED',
          message,
          details: {
            refreshLimit: (error as any)?.refreshLimit,
            refreshCountRemaining: (error as any)?.refreshCountRemaining ?? 0,
            retryAfter: 86400,
          },
        });
        return;
      }
    }

    const statusCode = isValidationError
      ? 400
      : isConfigurationError
      ? 503
      : isUpstreamError
      ? 502
      : isLimitError
      ? 429
      : 500;
    sendError(res, statusCode, {
      code: isValidationError
        ? 'VALIDATION_ERROR'
        : isConfigurationError
        ? 'SERVICE_UNAVAILABLE'
        : isUpstreamError
        ? 'UPSTREAM_ERROR'
        : isLimitError
        ? 'RATE_LIMITED'
        : 'INTERNAL_ERROR',
      message,
    });
  }
};

/**
 * 解除 DeBank 錢包地址連結（刪除該地址的快取資料）
 * 路由：DELETE /api/debank/addresses/:address
 */
export const unlinkDeBankAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const { address } = req.params as unknown as UnlinkAddressParams;
    const result = await DeBankService.unlinkUserAddress(req.userId, address);

    sendSuccess(res, {
      address: result.address,
      unlinked: true,
      deletedProtocolCount: result.deletedProtocolCount,
      deletedTokenCount: result.deletedTokenCount,
    });
  } catch (error) {
    logError('Unlink DeBank address failed', error, {
      userId: req.userId,
      address: req.params.address,
    });

    const message = error instanceof Error ? error.message : 'Failed to unlink DeBank address';
    const normalized = message.toLowerCase();
    const isValidationError = normalized.includes('address');

    sendError(res, isValidationError ? 400 : 500, {
      code: isValidationError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message,
    });
  }
};
