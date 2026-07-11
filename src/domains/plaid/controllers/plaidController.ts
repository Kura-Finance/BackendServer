import { Response, Request } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { PlaidService } from '../services/plaidService';
import { logError, logDebug, logBusinessEvent } from '../../logger';
import { StoredAccountOrderPayload } from '../models/types';
import { clearAllPlaidCache, getCacheStats } from '../lib/plaidCacheUtil';
import { prisma } from '../../shared/lib/prisma';

export const updatePlaidAccountOrder = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { accountIds, investmentAccountIds } = req.body as StoredAccountOrderPayload;

    if (accountIds === undefined && investmentAccountIds === undefined) {
      res.status(400).json({ error: 'accountIds or investmentAccountIds is required' });
      return;
    }

    const payload: StoredAccountOrderPayload = {};
    if (accountIds !== undefined) {
      payload.accountIds = accountIds;
    }
    if (investmentAccountIds !== undefined) {
      payload.investmentAccountIds = investmentAccountIds;
    }

    await PlaidService.updateAccountOrder(req.userId, payload);
    res.json({ status: 'success', message: 'Account order updated successfully.' });
  } catch (error: any) {
    logError('Update account order failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: '無法更新卡片排序' });
  }
};

export const createLinkToken = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const linkToken = await PlaidService.createLinkToken(req.userId);
    res.json({ link_token: linkToken });
  } catch (error: any) {
    const errorCode = error.response?.data?.error_code;
    const isCountryCodeError =
      errorCode === 'INVALID_FIELD' && error.message?.includes('country');
    const isFieldError = errorCode === 'INVALID_FIELD';
    const statusCode = isCountryCodeError || isFieldError ? 400 : 500;

    // 如果是配置錯誤，傳遞詳細的錯誤訊息供調試
    const message = error.message?.includes('Plaid ') 
      ? error.message 
      : '無法產生 Plaid Link Token';

    logError('Create Plaid link token failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
      errorCode,
      statusCode,
    });

    res.status(statusCode).json({
      error: message,
      errorCode: errorCode || 'UNKNOWN_ERROR',
      requestId: error.response?.data?.request_id,
    });
  }
};

export const exchangePublicToken = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { public_token, institution_name } = req.body;
    await PlaidService.exchangePublicToken(req.userId, public_token, institution_name);
    res.json({ status: 'success', message: '銀行帳戶已成功連結' });
  } catch (error: any) {
    logError('Exchange Plaid public token failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: 'Token 交換失敗' });
  }
};

export const disconnectPlaidAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { accountId } = req.body as { accountId?: string };
    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' });
      return;
    }

    await PlaidService.disconnectAccount(req.userId, accountId);
    res.json({ status: 'success', message: 'Account disconnected successfully.' });
  } catch (error: any) {
    logError('Disconnect Plaid account failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: '無法解除連結銀行帳戶' });
  }
};

export const getFinanceSnapshot = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const snapshot = await PlaidService.getFinanceSnapshot(req.userId);
    res.json(snapshot);
  } catch (error: any) {
    logError('Get finance snapshot failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: '無法取得 Plaid 金融資料' });
  }
};

/**
 * 獲取財務快照（仅使用緩存架構）
 * - API 層面只返回數據庫內容，Server 通過 Webhooks 自動更新數據庫
 * - 用戶可通過 ?refresh=true 參數強制更新，但受每日次數限制（基於訂閱等級）
 * - Basic: 1次/天, Pro: 5次/天, Ultimate: 20次/天, VIP: 無限
 */
export const getFinanceSnapshotOptimized = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const forceRefresh = req.query.refresh === 'true' || req.body?.forceRefresh === true;
    
    try {
      const snapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, forceRefresh);
      
      res.json({
        ...snapshot,
        _cacheSource: forceRefresh ? '強制刷新，來自 Plaid API' : '來自緩存',
      });
    } catch (error: any) {
      // 處理刷新限制錯誤
      if (error.statusCode === 429) {
        res.status(429).json({
          error: error.message,
          refreshLimit: error.refreshLimit,
          refreshCountRemaining: error.refreshCountRemaining,
        });
        return;
      }

      throw error;
    }
  } catch (error: any) {
    logError('Get finance snapshot failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: '無法取得金融資料' });
  }
};

/**
 * 手動刷新 Plaid 緩存
 */
export const refreshPlaidCache = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    // 手動刷新，強制從 API 獲取數據
    const snapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, true);

    res.json({
      status: 'success',
      message: '緩存已刷新',
      dataRefreshed: {
        accounts: snapshot.accounts.length,
        transactions: snapshot.transactions.length,
        investmentAccounts: snapshot.investmentAccounts.length,
        investments: snapshot.investments.length,
      },
    });
  } catch (error: any) {
    logError('Refresh Plaid cache failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: '無法刷新緩存' });
  }
};

/**
 * 清空 Plaid 緩存（完整清除）
 */
export const clearPlaidCache = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    await clearAllPlaidCache(req.userId);

    res.json({
      status: 'success',
      message: '所有 Plaid 緩存已清除',
    });
  } catch (error: any) {
    logError('Clear Plaid cache failed', error, {
      userId: req.userId,
    });
    res.status(500).json({ error: '無法清除緩存' });
  }
};

/**
 * 獲取 Plaid 緩存統計信息
 */
export const getCacheInfo = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const stats = await getCacheStats(req.userId);

    res.json({
      status: 'success',
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
    res.status(500).json({ error: '無法獲取緩存信息' });
  }
};

/**
 * 處理 Plaid Webhook
 * 無需認證 - Plaid 服務直接調用
 */
export const handlePlaidWebhook = async (req: Request, res: Response) => {
  try {
    const { webhook_type, webhook_code, item_id, error } = req.body;

    logDebug('Plaid webhook received', {
      webhook_type,
      webhook_code,
      item_id,
    });

    // 驗證 webhook（可選但推薦）
    // const isValid = verifyPlaidWebhook(req);
    // if (!isValid) {
    //   logWarn('Invalid Plaid webhook signature', { webhook_type });
    //   return res.status(401).json({ error: 'Invalid webhook' });
    // }

    // 立即返回 200，確認已收到（非回應式處理）
    res.status(200).json({ webhook_received: true });

    // 異步處理 webhook
    processPlaidWebhook(webhook_type, webhook_code, item_id, error).catch((err) => {
      logError('Error processing Plaid webhook', err, {
        webhook_type,
        webhook_code,
      });
    });
  } catch (error) {
    logError('Webhook receiver error', error);
    res.status(500).json({ error: 'Webhook processing failed' });
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
        // Item 發生錯誤
        logError('Plaid item error', new Error(error?.error_message || 'Unknown item error'), {
          item_id,
          error: error?.error_message,
        });
        // TODO: 將錯誤狀態保存到數據庫或通知用戶
        break;

      case 'PENDING_EXPIRATION':
        // Item 的授權即將過期
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
