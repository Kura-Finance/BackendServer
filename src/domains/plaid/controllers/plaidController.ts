import { Response, Request } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { PlaidService } from '../services/plaidService';
import { logError, logDebug, logBusinessEvent } from '../../logger';
import { clearAllPlaidCache, getCacheStats } from '../lib/plaidCacheUtil';
import { verifyPlaidWebhook } from '../lib/webhookVerification';
import { prisma } from '../../shared/lib/prisma';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

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
    
    // 第一次連接時取得財務快照（isManualRefresh=false，不受限制）
    try {
      const snapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, false);
      sendSuccess(res, { 
        message: 'Bank account linked successfully',
        snapshot,
      });
    } catch (snapshotError: any) {
      // 即使快照失敗，也不影響連結成功狀態
      logDebug('Failed to fetch initial snapshot after successful connection', snapshotError?.message || snapshotError);
      sendSuccess(res, { 
        message: 'Bank account linked successfully'
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
    logError('Disconnect Plaid item failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to disconnect Plaid item' });
  }
};

export const getFinanceSnapshot = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const snapshot = await PlaidService.getFinanceSnapshot(req.userId);
    sendSuccess(res, snapshot);
  } catch (error: any) {
    logError('Get finance snapshot failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch Plaid financial data' });
  }
};

/**
 * 獲取財務快照（仅使用緩存架構）
 * - API 層面只返回數據庫內容，Server 通過 Webhooks 自動更新數據庫
 * - 用戶可通過 ?refresh=true 參數強制更新，但受每日次數限制（基於訂閱等級）
 * - 達到限制時返回緩存數據
 * - Basic: 1次/天, Pro: 5次/天, Ultimate: 20次/天, VIP: 無限
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
      
      sendSuccess(res, {
        ...snapshot,
        _cacheSource: isManualRefresh ? 'Forced refresh from Plaid API' : 'From cache',
      });
    } catch (error: any) {
      // 處理刷新限制錯誤 - 達到限制時返回緩存數據
      if (error.statusCode === 429 && isManualRefresh) {
        try {
          logDebug('Refresh limit reached, returning cached data', { userId: req.userId });
          const cachedSnapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, false); // 獲取緩存不受限制
          
          sendSuccess(res, {
            ...cachedSnapshot,
            _cacheSource: 'Daily refresh limit reached, showing last synced data',
            _limitReached: true,
            _message: error.message,
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
    logError('Get finance snapshot failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch financial snapshot' });
  }
};

/**
 * 手動刷新 Plaid 緩存
 * 達到限制時返回緩存數據
 */
export const refreshPlaidCache = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    try {
      // 手動刷新，強制從 API 獲取數據
      const snapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, true);

      sendSuccess(res, {
        message: 'Cache refreshed successfully',
        dataRefreshed: {
          accounts: snapshot.accounts.length,
          transactions: snapshot.transactions.length,
          investmentAccounts: snapshot.investmentAccounts.length,
          investments: snapshot.investments.length,
        },
      });
    } catch (error: any) {
      // 處理刷新限制錯誤 - 達到限制時返回緩存數據
      if (error.statusCode === 429) {
        try {
          logDebug('Refresh limit reached, returning cached data', { userId: req.userId });
          const cachedSnapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, false);
          
          sendSuccess(res, {
            status: 'cache_limit_reached',
            message: 'Daily refresh limit reached, returning last synced data',
            limitMessage: error.message,
            dataRefreshed: {
              accounts: cachedSnapshot.accounts.length,
              transactions: cachedSnapshot.transactions.length,
              investmentAccounts: cachedSnapshot.investmentAccounts.length,
              investments: cachedSnapshot.investments.length,
            },
            _limitReached: true,
          });
          return;
        } catch (cacheError) {
          // 如果無法獲取緩存數據，返回錯誤
          sendError(res, 429, {
            code: 'RATE_LIMITED',
            message: 'Daily refresh limit reached and no cached data is available',
            details: {
              limitMessage: error.message,
              retryAfter: 86400,
            },
          });
          return;
        }
      }

      throw error;
    }
  } catch (error: any) {
    logError('Refresh Plaid cache failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to refresh cache' });
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
