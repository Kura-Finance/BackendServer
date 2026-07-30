/** DeBank HTTP controllers for encrypted protocol/token snapshots and unlink. */

import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { DeBankService } from '../services/debankService';
import { logError } from '../../logger';
import type { GetProtocolsQuery } from '../schemas/debankSchemas';
import type { UnlinkAddressParams } from '../schemas/debankSchemas';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import {
  buildCacheResponseFields,
  CACHE_PROVIDER,
} from '../../shared/lib/cacheResponseUtil';

/**
 * Map DeBank service errors to HTTP responses.
 */
function sendDeBankError(
  res: Response,
  err: unknown,
  fallbackMessage: string,
  refreshRequested: boolean,
  retryCachedRead: () => Promise<void>,
): Promise<void> | void {
  const message = err instanceof Error ? err.message : fallbackMessage;
  const normalized = message.toLowerCase();
  const isValidationError = normalized.includes('address');
  const isConfigurationError = normalized.includes('configured');
  const isUpstreamError = normalized.includes('debank api request failed');
  const isLimitError = (err as any)?.statusCode === 429;

  if (refreshRequested && isLimitError) {
    return retryCachedRead();
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
    ...(isLimitError
      ? {
          details: {
            refreshLimit: (err as any)?.refreshLimit,
            refreshCountRemaining: (err as any)?.refreshCountRemaining ?? 0,
            retryAfter: 86400,
          },
        }
      : {}),
  });
}

/**
 * Get user DeBank protocol data (Phase 3 Zero-Access E2EE only).
 * Route: GET /api/debank/protocols?address=0x...&refresh=true|false
 *
 * Returns: { address, payloadKeys[], protocols: encryptedRows[], total, _cacheSource, ... }
 * - _cacheSource: 'From cache' | 'Forced refresh from DeBank API' | 'Daily refresh limit reached, showing last synced data'
 * - Backend never decrypts; client unwraps payloadKeys then decrypts each row.
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
      address: result.address,
      payloadKeys: result.payloadKeys,
      protocols: result.protocols,
      total: result.protocols.length,
      ...buildCacheResponseFields({
        forceRefresh,
        provider: CACHE_PROVIDER.DEBANK,
      }),
    });
  } catch (error) {
    logError('Get DeBank protocol positions failed', error, {
      userId: req.userId,
      address: req.query.address,
    });

    const refreshRequested = String(req.query.refresh || '').toLowerCase() === 'true';
    await sendDeBankError(
      res,
      error,
      'Failed to fetch protocol positions',
      refreshRequested,
      async () => {
        const address = String(req.query.address || '').trim();
        const cached = await DeBankService.getUserProtocolPositions(req.userId!, address, false);
        sendSuccess(res, {
          address: cached.address,
          payloadKeys: cached.payloadKeys,
          protocols: cached.protocols,
          total: cached.protocols.length,
          ...buildCacheResponseFields({
            forceRefresh: true,
            limitReached: true,
            message: error instanceof Error ? error.message : undefined,
            provider: CACHE_PROVIDER.DEBANK,
          }),
        });
      },
    );
  }
};

/**
 * Get user DeBank EVM token holdings (Phase 3 Zero-Access E2EE only).
 * Route: GET /api/debank/tokens?address=0x...&refresh=true|false
 *
 * Returns: { address, payloadKeys[], tokens: encryptedRows[], total, _cacheSource, ... }
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

    sendSuccess(res, {
      address: result.address,
      payloadKeys: result.payloadKeys,
      tokens: result.tokens,
      total: result.tokens.length,
      ...buildCacheResponseFields({
        forceRefresh,
        provider: CACHE_PROVIDER.DEBANK,
      }),
    });
  } catch (error) {
    logError('Get DeBank token positions failed', error, {
      userId: req.userId,
      address: req.query.address,
    });

    const refreshRequested = String(req.query.refresh || '').toLowerCase() === 'true';
    await sendDeBankError(
      res,
      error,
      'Failed to fetch token positions',
      refreshRequested,
      async () => {
        const address = String(req.query.address || '').trim();
        const cached = await DeBankService.getUserTokenPositions(req.userId!, address, false);
        sendSuccess(res, {
          address: cached.address,
          payloadKeys: cached.payloadKeys,
          tokens: cached.tokens,
          total: cached.tokens.length,
          ...buildCacheResponseFields({
            forceRefresh: true,
            limitReached: true,
            message: error instanceof Error ? error.message : undefined,
            provider: CACHE_PROVIDER.DEBANK,
          }),
        });
      },
    );
  }
};

/**
 * Unlink a DeBank wallet address (clear cached data for that address).
 * Route: DELETE /api/debank/addresses/:address
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
