import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { PlaidService } from '../services/plaidService';
import { logError } from '../../logger';
import { StoredAccountOrderPayload } from '../models/types';
import { clearAllPlaidCache, getCacheStats } from '../lib/plaidCacheUtil';

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
 * 獲取財務快照（使用緩存，避免過度 API 調用）
 */
export const getFinanceSnapshotOptimized = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const forceRefresh = req.query.refresh === 'true' || req.body?.forceRefresh === true;
    const snapshot = await PlaidService.getFinanceSnapshotOptimized(req.userId, forceRefresh);
    
    res.json({
      ...snapshot,
      _cacheHint: forceRefresh ? '強制刷新，來自 Plaid API' : '可能來自緩存',
    });
  } catch (error: any) {
    logError('Get finance snapshot optimized failed', error, {
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
