/** Exchange HTTP controllers — connect, balances (E2EE), accounts, disconnect. */

import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { ExchangeService } from '../services/exchangeService';
import { logError } from '../../logger';
import { KURA_SUPPORTED_EXCHANGES, getExchangeIcon } from '../../shared/lib/symbolsAndExchangesUtil';
import { checkApiLimit, recordApiOperation } from '../../shared/lib/apiRateLimitUtil';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import {
  buildCacheResponseFields,
  CACHE_PROVIDER,
} from '../../shared/lib/cacheResponseUtil';

/**
 * Link an exchange account (subject to daily connect rate limits by tier).
 */
export const connectExchange = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    // Check API operation limit
    const limitCheck = await checkApiLimit(req.userId, 'exchange_connect');
    if (!limitCheck.canOperate) {
      sendError(res, 429, {
        code: 'RATE_LIMITED',
        message: 'Daily connect limit reached',
        details: {
          limitMessage: limitCheck.message,
          retryAfter: 86400,
        },
      });
      return;
    }

    const { exchange, apiKey, apiSecret, passphrase } = req.body;

    const account = await ExchangeService.connectExchange(
      req.userId,
      exchange.toLowerCase(),
      apiKey,
      apiSecret,
      passphrase
    );

    // Record API operation
    await recordApiOperation(req.userId, 'exchange_connect');

    sendSuccess(res, {
      account: {
        accountId: account.id,
        id: account.id,
        exchange: account.exchange,
        exchangeDisplayName: account.exchangeDisplayName,
        icon: getExchangeIcon(account.exchange),
        isVerified: account.isVerified,
      },
      rateLimitInfo: {
        remaining: limitCheck.operationCountRemaining - 1,
        limit: limitCheck.operationLimit,
      },
    });
  } catch (error) {
    logError('Connect exchange failed', error, { userId: req.userId });
    sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to connect exchange account',
    });
  }
};

/**
 * Get exchange balances + assets (Phase 3 Zero-Access E2EE only).
 *
 * Route: GET /api/exchange/:exchangeAccountId/balances
 *
 * - Triggers CCXT sync → encrypt cache → return encrypted snapshot
 * - On query limit: fall back to encrypted cache (no CCXT)
 * - Backend never decrypts; client unwraps payloadKeys then decrypts rows
 */
export const getExchangeBalances = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const limitCheck = await checkApiLimit(req.userId, 'exchange_balance');
    const exchangeAccountId = req.params.exchangeAccountId as string;

    if (!limitCheck.canOperate) {
      try {
        const cachedResult = await ExchangeService.getEncryptedBalancesAndAssets(
          req.userId,
          exchangeAccountId,
        );

        sendSuccess(res, {
          ...cachedResult,
          account: {
            ...cachedResult.account,
            icon: getExchangeIcon(cachedResult.account.exchange),
          },
          ...buildCacheResponseFields({
            forceRefresh: true,
            limitReached: true,
            message: limitCheck.message,
            provider: CACHE_PROVIDER.EXCHANGE,
          }),
          rateLimitInfo: {
            remaining: 0,
            limit: limitCheck.operationLimit,
            limitReached: true,
            message: limitCheck.message,
          },
        });
        return;
      } catch (cacheError) {
        sendError(res, 429, {
          code: 'RATE_LIMITED',
          message: 'Daily balance query limit reached',
          details: {
            limitMessage: limitCheck.message,
            retryAfter: 86400,
          },
        });
        return;
      }
    }

    const result = await ExchangeService.getBalancesAndAssets(
      req.userId,
      exchangeAccountId,
    );

    await recordApiOperation(req.userId, 'exchange_balance');

    sendSuccess(res, {
      ...result,
      account: {
        ...result.account,
        icon: getExchangeIcon(result.account.exchange),
      },
      ...buildCacheResponseFields({
        forceRefresh: true,
        provider: CACHE_PROVIDER.EXCHANGE,
      }),
      rateLimitInfo: {
        remaining: limitCheck.operationCountRemaining - 1,
        limit: limitCheck.operationLimit,
        limitReached: false,
      },
    });
  } catch (error) {
    logError('Get exchange balances failed', error, { userId: req.userId });
    sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to fetch exchange balances',
    });
  }
};

/**
 * List the user's linked exchange accounts.
 */
export const getUserExchangeAccounts = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const accounts = await ExchangeService.getUserExchangeAccounts(req.userId);

    const accountsWithIcon = accounts.map(account => ({
      ...account,
      icon: getExchangeIcon(account.exchange),
    }));

    sendSuccess(res, {
      accounts: accountsWithIcon,
      metadata: {
        timestamp: new Date().toISOString(),
        count: accounts.length,
      },
    });
  } catch (error) {
    logError('Get user exchange accounts failed', error, { userId: req.userId });
    sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch exchange accounts',
    });
  }
};

/**
 * Disconnect an exchange account.
 */
export const disconnectExchange = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const exchangeAccountId = req.params.exchangeAccountId as string;

    const result = await ExchangeService.disconnectExchange(
      req.userId,
      exchangeAccountId
    );

    sendSuccess(res, result);
  } catch (error) {
    logError('Disconnect exchange failed', error, { userId: req.userId });
    sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to disconnect exchange account',
    });
  }
};

/**
 * List supported exchanges (static catalog).
 */
export const getSupportedExchanges = async (req: AuthRequest, res: Response) => {
  try {
    const exchanges = ExchangeService.getSupportedExchanges();

    sendSuccess(res, {
      exchanges,
      metadata: {
        timestamp: new Date().toISOString(),
        count: exchanges.length,
        message: `${exchanges.length} exchanges supported`,
      },
    });
  } catch (error) {
    logError('Get supported exchanges failed', error);
    sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch supported exchanges',
    });
  }
};
