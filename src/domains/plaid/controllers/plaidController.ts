/**
 * Plaid HTTP handlers — Link, snapshots, cache, and webhooks.
 */
import { Response, Request } from 'express';
import { getUpgradeUrl } from '../../../config/brand';
import { AuthRequest } from '../../auth/middleware/auth';
import { PlaidService } from '../services/plaidService';
import { PlaidAccountNotFoundError } from '../services/plaidAccountService';
import { logError, logDebug, logBusinessEvent } from '../../logger';
import { clearAllPlaidCache, getCacheStats } from '../lib/plaidCacheUtil';
import { verifyPlaidWebhook } from '../lib/webhookVerification';
import { prisma } from '../../shared/lib/prisma';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { KeyPairNotConfiguredError } from '../../shared/services/payloadKeyService';
import {
  buildCacheResponseFields,
  CACHE_PROVIDER,
} from '../../shared/lib/cacheResponseUtil';

function resolvePlaidLastSyncedAt(cacheStats: {
  lastSynced?: Date | null;
  accountsSynced?: Date | null;
  transactionsSynced?: Date | null;
  investmentsSynced?: Date | null;
}): string | null {
  const timestamps = [
    cacheStats.lastSynced,
    cacheStats.accountsSynced,
    cacheStats.transactionsSynced,
    cacheStats.investmentsSynced,
  ]
    .filter((value): value is Date => Boolean(value))
    .map((value) => value.getTime());

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

/** POST /api/plaid/create-link-token */
export const createLinkToken = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const linkToken = await PlaidService.createLinkToken(req.userId);
    sendSuccess(res, { link_token: linkToken });
  } catch (error: any) {
    const errorCode = error.response?.data?.error_code;
    const isCountryCodeError =
      errorCode === 'INVALID_FIELD' && error.message?.includes('country');
    const isFieldError = errorCode === 'INVALID_FIELD';
    const statusCode = isCountryCodeError || isFieldError ? 400 : 500;

    // Surface detailed config errors for debugging
    const message = error.message?.includes('Plaid ') 
      ? error.message 
      : 'Unable to create Plaid Link Token';

    logError('Create Plaid link token failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
      errorCode,
      statusCode,
    });

    sendError(res, statusCode, {
      code: errorCode || 'UNKNOWN_ERROR',
      message,
      details: {
        requestId: error.response?.data?.request_id,
      },
    });
  }
};

/** POST /api/plaid/exchange-public-token — link Item and kick off encrypted snapshot. */
export const exchangePublicToken = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const { public_token, institution_name } = req.body;
    await PlaidService.exchangePublicToken(req.userId, public_token, institution_name);

    const itemCount = await prisma.plaidItem.count({ where: { userId: req.userId } });
    logBusinessEvent('plaid_exchange_token_done', req.userId, {
      institution: institution_name || 'Unknown',
      plaidItemCount: itemCount,
    });

    // Phase 3: on first connect, sync encrypted snapshot (client reads /encrypted)
    try {
      const snapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, false);
      logBusinessEvent('plaid_initial_snapshot_after_connect', req.userId, {
        accounts: snapshot.accounts.length,
        transactions: snapshot.transactions.length,
        investmentAccounts: snapshot.investmentAccounts.length,
        investments: snapshot.investments.length,
        payloadKeys: snapshot.payloadKeys.length,
        partial: snapshot.partial,
        failedItemIds: snapshot.failedItemIds,
      });
      if (snapshot.payloadKeys.length === 0 && snapshot.accounts.length === 0) {
        logDebug('Initial snapshot is empty after connect — check keypair / Plaid item fetch', {
          userId: req.userId,
          plaidItemCount: itemCount,
        });
      }
      sendSuccess(res, {
        message: 'Bank account linked successfully',
        snapshot,
      });
    } catch (snapshotError: any) {
      // Link succeeded; snapshot failure does not undo it — log the real cause loudly.
      const isKeyPairMissing = snapshotError instanceof KeyPairNotConfiguredError;
      logError('Initial Plaid snapshot after connect failed', snapshotError, {
        userId: req.userId,
        plaidItemCount: itemCount,
        reason: isKeyPairMissing ? 'KEY_PAIR_NOT_CONFIGURED' : snapshotError?.name || 'UNKNOWN',
        hint: isKeyPairMissing
          ? 'User must POST /api/auth/keys/setup before encrypted Plaid sync can persist data.'
          : undefined,
      });
      sendSuccess(res, {
        message: 'Bank account linked successfully',
        // Tell the client why snapshot is missing: E2EE keypair required before encrypt/write.
        keyPairRequired: isKeyPairMissing,
      });
    }
  } catch (error: any) {
    logError('Exchange Plaid public token failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Public token exchange failed' });
  }
};

/** POST /api/plaid/disconnect-item */
export const disconnectPlaidItem = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const { accountId } = req.body as { accountId: string };

    const disconnectResult = await PlaidService.disconnectItemByAccountId(req.userId, accountId);
    sendSuccess(res, {
      message: 'Plaid item disconnected successfully.',
      data: {
        matchedAccountId: disconnectResult.accountId,
        disconnectedItemId: disconnectResult.disconnectedItemId,
        institution: disconnectResult.institution,
        plaidRequestId: disconnectResult.plaidRequestId,
      },
    });
  } catch (error: any) {
    if (error instanceof PlaidAccountNotFoundError) {
      sendError(res, 404, {
        code: 'PLAID_ACCOUNT_NOT_FOUND',
        message: error.message,
      });
      return;
    }
    logError('Disconnect Plaid item failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to disconnect Plaid item' });
  }
};

/**
 * Finance snapshot (cache-first).
 * - API returns DB contents; server updates via webhooks
 * - `?refresh=true` forces refresh under daily tier limits
 * - On limit: return cached data
 * - Basic: 1/day, Pro: 5/day, Ultimate: 20/day
 */
export const getFinanceSnapshotOptimized = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    // Manual refresh only when refresh=true — subject to daily limits
    const { refresh } = req.query as { refresh?: boolean };
    const isManualRefresh = refresh === true || req.body?.isManualRefresh === true;
    
    try {
      const snapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, isManualRefresh);
      const cacheStats = await getCacheStats(req.userId);
      const lastSyncedAt = isManualRefresh
        ? new Date().toISOString()
        : resolvePlaidLastSyncedAt(cacheStats);

      const status = snapshot.partial ? 207 : 200;
      sendSuccess(
        res,
        {
          ...snapshot,
          ...buildCacheResponseFields({
            forceRefresh: isManualRefresh,
            provider: CACHE_PROVIDER.PLAID,
          }),
          lastSyncedAt,
        },
        status,
      );
    } catch (error: any) {
      // On refresh-limit error, return cached data
      if (error.statusCode === 429 && isManualRefresh) {
        try {
          logDebug('Refresh limit reached, returning cached data', { userId: req.userId });
          const cachedSnapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, false); // cache read is unlimited
          const cacheStats = await getCacheStats(req.userId);
          
          sendSuccess(res, {
            ...cachedSnapshot,
            ...buildCacheResponseFields({
              forceRefresh: true,
              limitReached: true,
              message: error.message,
              provider: CACHE_PROVIDER.PLAID,
            }),
            lastSyncedAt: resolvePlaidLastSyncedAt(cacheStats),
          });
          return;
        } catch (cacheError) {
          // If cache cannot be loaded, return the rate-limit error
          sendError(res, 429, {
            code: 'RATE_LIMITED',
            message: error.message,
            details: {
              refreshLimit: error.refreshLimit,
              refreshCountRemaining: error.refreshCountRemaining,
              upgrade: getUpgradeUrl(),
              retryAfter: 86400,
            },
          });
          return;
        }
      }

      throw error;
    }
  } catch (error: any) {
    if (error instanceof KeyPairNotConfiguredError) {
      sendError(res, 409, {
        code: 'KEY_PAIR_REQUIRED',
        message: 'E2EE key pair not configured. Call POST /api/auth/keys/setup to enable encrypted sync.',
      });
      return;
    }
    logError('Get finance snapshot failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch financial snapshot' });
  }
};

/**
 * Clear all Plaid cache for the user.
 */
export const clearPlaidCache = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    await clearAllPlaidCache(req.userId);

    sendSuccess(res, {
      message: 'All Plaid cache cleared',
    });
  } catch (error: any) {
    logError('Clear Plaid cache failed', error, {
      userId: req.userId,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to clear cache' });
  }
};

/**
 * Encrypted finance snapshot (Phase 3 Zero-Access E2EE).
 *
 * Returns payloadKeys + metadata/ciphertext rows (accounts, transactions,
 * investmentAccounts, investments) and lastSyncedAt.
 *
 * Client: unwrap encryptedPrivateKey with KEK → privateKey; open each
 * wrappedSek; AES-GCM decrypt row payloads; merge metadata + plaintext to render.
 */
export const getEncryptedFinanceSnapshot = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const snapshot = await PlaidService.getEncryptedFinanceSnapshot(req.userId);
    const cacheStats = await getCacheStats(req.userId);
    const lastSyncedAt = resolvePlaidLastSyncedAt(cacheStats);

    logBusinessEvent('plaid_encrypted_snapshot_served', req.userId, {
      accounts: snapshot.accounts.length,
      transactions: snapshot.transactions.length,
      investmentAccounts: snapshot.investmentAccounts.length,
      investments: snapshot.investments.length,
      payloadKeys: snapshot.payloadKeys.length,
      lastSyncedAt,
    });
    if (snapshot.payloadKeys.length === 0) {
      // No payloadKeys → client cannot decrypt any row (usually: no keypair yet,
      // or pre-keypair plaintext rows were filtered). Log loudly for debugging.
      logDebug('Encrypted snapshot has no payloadKeys — frontend will show no data', {
        userId: req.userId,
        cachedAccounts: cacheStats.accounts,
        cachedTransactions: cacheStats.transactions,
        hint: 'Confirm POST /api/auth/keys/setup was called, then re-sync (refresh=true).',
      });
    }

    sendSuccess(res, {
      ...snapshot,
      lastSyncedAt,
    });
  } catch (error: any) {
    logError('Get encrypted finance snapshot failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch encrypted financial snapshot' });
  }
};

/**
 * Plaid cache stats and sync timestamps.
 */
export const getCacheInfo = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const stats = await getCacheStats(req.userId);

    sendSuccess(res, {
      cacheStats: {
        cachedAccounts: stats.accounts,
        cachedTransactions: stats.transactions,
        cachedInvestmentAccounts: stats.investmentAccounts,
        cachedInvestments: stats.investments,
        lastFullSync: stats.lastSynced,
        accountsLastSync: stats.accountsSynced,
        transactionsLastSync: stats.transactionsSynced,
        investmentsLastSync: stats.investmentsSynced,
      },
    });
  } catch (error: any) {
    logError('Get cache info failed', error, {
      userId: req.userId,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch cache info' });
  }
};

/**
 * Plaid webhook ingress (no auth — called by Plaid).
 */
export const handlePlaidWebhook = async (req: Request, res: Response) => {
  try {
    const verification = await verifyPlaidWebhook(req);
    if (!verification.isValid) {
      logDebug('Rejected Plaid webhook: signature validation failed', {
        reason: verification.reason,
      });
      sendError(res, 401, { code: 'INVALID_SIGNATURE', message: 'Invalid Plaid webhook signature' });
      return;
    }

    const { webhook_type, webhook_code, item_id, error } = req.body;

    logDebug('Plaid webhook received', {
      webhook_type,
      webhook_code,
      item_id,
    });

    // Ack immediately with 200 (process asynchronously)
    sendSuccess(res, { webhook_received: true }, 200);

    // Process webhook asynchronously
    processPlaidWebhook(webhook_type, webhook_code, item_id, error).catch((err) => {
      logError('Error processing Plaid webhook', err, {
        webhook_type,
        webhook_code,
      });
    });
  } catch (error) {
    logError('Webhook receiver error', error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Webhook processing failed' });
  }
};

/**
 * Async Plaid webhook dispatcher.
 */
async function processPlaidWebhook(
  webhook_type: string,
  webhook_code: string,
  item_id: string,
  error?: any
) {
  try {
    switch (webhook_type) {
      case 'ITEM':
        await handleItemWebhook(webhook_code, item_id, error);
        break;

      case 'TRANSACTIONS':
        await handleTransactionsWebhook(webhook_code, item_id);
        break;

      case 'INVESTMENTS_TRANSACTIONS':
        await handleInvestmentTransactionsWebhook(webhook_code, item_id);
        break;

      case 'AUTH':
        await handleAuthWebhook(webhook_code, item_id);
        break;

      default:
        logDebug('Unknown webhook type', { webhook_type });
    }
  } catch (error) {
    logError('Webhook processing error', error, {
      webhook_type,
      webhook_code,
    });
  }
}

/**
 * Handle ITEM webhook events.
 */
async function handleItemWebhook(webhook_code: string, item_id: string, error?: any) {
  try {
    switch (webhook_code) {
      case 'ERROR':
        // Plaid Item error
        logError('Plaid item error', new Error(error?.error_message || 'Unknown item error'), {
          item_id,
          error: error?.error_message,
        });
        // TODO: persist error state or notify the user
        break;

      case 'PENDING_EXPIRATION':
        // Plaid Item authorization is about to expire
        logDebug('Plaid item pending expiration', { item_id });
        // TODO: prompt the user to re-authenticate
        break;

      case 'LOGIN_REPAIRED':
        // LOGIN_REPAIRED — user re-authorized
        logBusinessEvent('plaid_item_repaired', 'system', {
          item_id,
        });
        // TODO: clear error state and resume sync
        break;

      case 'USER_PERMISSION_REVOKED':
        // User revoked permissions
        await handleUserPermissionRevoked(item_id);
        break;

      default:
        logDebug('Item webhook code', { webhook_code });
    }
  } catch (err) {
    logError('Error handling item webhook', err, { item_id });
  }
}

/**
 * Handle transaction sync webhooks.
 */
async function handleTransactionsWebhook(webhook_code: string, item_id: string) {
  try {
    if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      logBusinessEvent('plaid_transactions_sync_available', 'system', {
        item_id,
      });
      
      // Pull latest data from Plaid immediately
      await triggerPlaidDataSync(item_id, 'TRANSACTIONS');
    } else if (webhook_code === 'INITIAL_UPDATE_COMPLETE') {
      logBusinessEvent('plaid_initial_transactions_complete', 'system', {
        item_id,
      });
      // Initial transaction sync complete
    }
  } catch (err) {
    logError('Error handling transactions webhook', err, { item_id });
  }
}

/**
 * Handle investment-transaction sync webhooks.
 */
async function handleInvestmentTransactionsWebhook(webhook_code: string, item_id: string) {
  try {
    if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      logBusinessEvent('plaid_investment_transactions_sync_available', 'system', {
        item_id,
      });
      
      // Pull latest investment data from Plaid immediately
      await triggerPlaidDataSync(item_id, 'INVESTMENTS');
    }
  } catch (err) {
    logError('Error handling investment transactions webhook', err, { item_id });
  }
}

/**
 * Handle AUTH webhook events.
 */
async function handleAuthWebhook(webhook_code: string, item_id: string) {
  try {
    switch (webhook_code) {
      case 'VERIFIED_MICRODEPOSITS_AVAILABLE':
        logBusinessEvent('plaid_microdeposits_available', 'system', { item_id });
        break;

      case 'VERIFIED_MICRODEPOSITS_PENDING_EXPIRATION':
        logDebug('Plaid microdeposits pending expiration', { item_id });
        break;

      default:
        logDebug('Auth webhook code', { webhook_code });
    }
  } catch (err) {
    logError('Error handling auth webhook', err, { item_id });
  }
}

/**
 * Trigger server-side Plaid data sync from a webhook
 * so data updates even when the app is closed.
 */
async function triggerPlaidDataSync(item_id: string, dataType: 'TRANSACTIONS' | 'INVESTMENTS') {
  try {
    const plaidItem = await prisma.plaidItem.findUnique({
      where: { itemId: item_id },
      include: { user: true },
    });

    if (!plaidItem) {
      logDebug('Plaid item not found', { item_id });
      return;
    }

    logDebug('Triggering Plaid data sync', {
      userId: plaidItem.userId,
      item_id,
      dataType,
    });

    // PlaidService sync methods pull latest data and write cache
    
    switch (dataType) {
      case 'TRANSACTIONS':
        await PlaidService.syncTransactionsFromWebhook(plaidItem.userId, item_id);
        break;

      case 'INVESTMENTS':
        await PlaidService.syncInvestmentsFromWebhook(plaidItem.userId, item_id);
        break;
    }
  } catch (err) {
    logError('Error triggering Plaid data sync', err, { item_id });
  }
}

/**
 * Handle USER_PERMISSION_REVOKED.
 */
async function handleUserPermissionRevoked(item_id: string) {
  try {
    const plaidItem = await prisma.plaidItem.findUnique({
      where: { itemId: item_id },
    });

    if (plaidItem) {
      logDebug('User revoked Plaid permissions', {
        item_id,
        userId: plaidItem.userId,
      });

      // Mark item as needing re-auth
      logBusinessEvent('plaid_permissions_revoked', plaidItem.userId, {
        item_id,
      });
      
      // TODO: add a DB field such as needsReauth = true
    }
  } catch (err) {
    logError('Error handling user permission revoked', err, { item_id });
  }
}
