import { Response, Request } from 'express';
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

    // 如果是配置錯誤，傳遞詳細的錯誤訊息供調試
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

    // Phase 3：第一次連接時觸發加密快照同步（前端會用 /encrypted endpoint 取資料）
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
      // 連結本身已成功；snapshot 失敗不影響連結狀態，但必須 loud log 出真正原因。
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
        // 讓前端知道為何沒有 snapshot：需先設定 E2EE keypair 才能加密寫入並顯示資料。
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
 * 獲取財務快照（仅使用緩存架構）
 * - API 層面只返回數據庫內容，Server 通過 Webhooks 自動更新數據庫
 * - 用戶可通過 ?refresh=true 參數強制更新，但受每日次數限制（基於訂閱等級）
 * - 達到限制時返回緩存數據
 * - Basic: 1次/天, Pro: 5次/天, Ultimate: 20次/天
 */
export const getFinanceSnapshotOptimized = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    // 只有當用戶明確請求 refresh=true 時才是手動刷新，受每日限制
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
      // 處理刷新限制錯誤 - 達到限制時返回緩存數據
      if (error.statusCode === 429 && isManualRefresh) {
        try {
          logDebug('Refresh limit reached, returning cached data', { userId: req.userId });
          const cachedSnapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, false); // 獲取緩存不受限制
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
          // 如果無法獲取緩存數據，返回錯誤
          sendError(res, 429, {
            code: 'RATE_LIMITED',
            message: error.message,
            details: {
              refreshLimit: error.refreshLimit,
              refreshCountRemaining: error.refreshCountRemaining,
              upgrade: process.env.APP_UPGRADE_URL || 'https://kura-finance.com/pricing',
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
 * 清空 Plaid 緩存（完整清除）
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
 * 取得「加密形式」財務快照（Phase 3 Zero-Access E2EE）
 *
 * 回傳：
 *   {
 *     payloadKeys: [{ id, scope, wrappedSek, algorithm }, ...],
 *     accounts:    [{ accountId, plaidItemId, type, bucket, cachedAt, payloadCiphertext, payloadKeyId }, ...],
 *     transactions:[{ transactionId, accountId, date, month, isPending, ..., payloadCiphertext, payloadKeyId }, ...],
 *     investmentAccounts: [{ accountId, cachedAt, payloadCiphertext, payloadKeyId }, ...],
 *     investments: [{ investmentId, accountId, type, ..., payloadCiphertext, payloadKeyId }, ...],
 *     lastSyncedAt
 *   }
 *
 * 前端流程：
 *   1. 用 KEK 解 encryptedPrivateKey → privateKey
 *   2. for each payloadKey: SEK = sealed_box_open(wrappedSek, privateKey, publicKey)
 *   3. for each row: plain = AES-GCM_decrypt(SEK, payloadCiphertext)
 *   4. 合併 metadata + plain → 渲染
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
      // 沒有 payloadKeys = 前端無法解密任何 row（通常代表：尚未設定 keypair，
      // 或設定 keypair 前寫入的舊明文 row 已被過濾）。loud 一點方便排查。
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
 * 獲取 Plaid 緩存統計信息
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
 * 處理 Plaid Webhook
 * 無需認證 - Plaid 服務直接調用
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

    // 立即返回 200，確認已收到（非回應式處理）
    sendSuccess(res, { webhook_received: true }, 200);

    // 非同步處理 Webhook
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
 * 異步處理 Plaid Webhook
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
 * 處理 ITEM 相關事件
 */
async function handleItemWebhook(webhook_code: string, item_id: string, error?: any) {
  try {
    switch (webhook_code) {
      case 'ERROR':
        // Plaid Item 發生錯誤
        logError('Plaid item error', new Error(error?.error_message || 'Unknown item error'), {
          item_id,
          error: error?.error_message,
        });
        // TODO: 將錯誤狀態保存到數據庫或通知用戶
        break;

      case 'PENDING_EXPIRATION':
        // Plaid Item 的授權即將過期
        logDebug('Plaid item pending expiration', { item_id });
        // TODO: 提醒用戶重新驗證
        break;

      case 'LOGIN_REPAIRED':
        // LOGIN_REPAIRED 表示用戶已重新授權
        logBusinessEvent('plaid_item_repaired', 'system', {
          item_id,
        });
        // TODO: 清除錯誤狀態，恢復同步
        break;

      case 'USER_PERMISSION_REVOKED':
        // 用戶撤銷了權限
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
 * 處理交易同步完成
 */
async function handleTransactionsWebhook(webhook_code: string, item_id: string) {
  try {
    if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      logBusinessEvent('plaid_transactions_sync_available', 'system', {
        item_id,
      });
      
      // 🔑 主動同步：後端立即從 Plaid 拉取最新數據
      await triggerPlaidDataSync(item_id, 'TRANSACTIONS');
    } else if (webhook_code === 'INITIAL_UPDATE_COMPLETE') {
      logBusinessEvent('plaid_initial_transactions_complete', 'system', {
        item_id,
      });
      // 初始交易同步完成
    }
  } catch (err) {
    logError('Error handling transactions webhook', err, { item_id });
  }
}

/**
 * 處理投資交易同步完成
 */
async function handleInvestmentTransactionsWebhook(webhook_code: string, item_id: string) {
  try {
    if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      logBusinessEvent('plaid_investment_transactions_sync_available', 'system', {
        item_id,
      });
      
      // 🔑 主動同步：後端立即從 Plaid 拉取最新投資數據
      await triggerPlaidDataSync(item_id, 'INVESTMENTS');
    }
  } catch (err) {
    logError('Error handling investment transactions webhook', err, { item_id });
  }
}

/**
 * 處理 AUTH 相關事件
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
 * 觸發 Plaid 數據同步（後端主動拉取）
 * 在 Webhook 中調用，確保即使 App 未打開也能更新數據
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

    // 🔑 調用 PlaidService 的同步方法
    // 這些方法會後端主動拉取最新數據並保存到緩存
    
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
 * 處理用戶權限撤銷
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

      // 標記 item 為需要重新授權
      logBusinessEvent('plaid_permissions_revoked', plaidItem.userId, {
        item_id,
      });
      
      // TODO: 可在數據庫中添加字段如：needsReauth = true
    }
  } catch (err) {
    logError('Error handling user permission revoked', err, { item_id });
  }
}
