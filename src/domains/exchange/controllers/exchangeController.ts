import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { ExchangeService } from '../services/exchangeService';
import { logError } from '../../logger';
import { KURA_SUPPORTED_EXCHANGES } from '../constants';

/**
 * 連結交易所帳戶
 */
export const connectExchange = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { exchange, apiKey, apiSecret, passphrase } = req.body;

    if (!exchange || !apiKey || !apiSecret) {
      res.status(400).json({
        error: '缺少必要參數: exchange, apiKey, apiSecret',
      });
      return;
    }

    const account = await ExchangeService.connectExchange(
      req.userId,
      exchange.toLowerCase(),
      apiKey,
      apiSecret,
      passphrase
    );

    res.json({
      success: true,
      account: {
        accountId: account.id,
        id: account.id,
        exchange: account.exchange,
        exchangeDisplayName: account.exchangeDisplayName,
        isVerified: account.isVerified,
      },
    });
  } catch (error) {
    logError('Connect exchange failed', error, { userId: req.userId });
    res.status(500).json({
      error: error instanceof Error ? error.message : '連接交易所失敗',
    });
  }
};

/**
 * 獲取交易所餘額
 */
export const getExchangeBalances = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const exchangeAccountId = req.params.exchangeAccountId as string;

    if (!exchangeAccountId || exchangeAccountId === 'undefined') {
      res.status(400).json({ error: '缺少必要參數: exchangeAccountId' });
      return;
    }

    const balances = await ExchangeService.getExchangeBalances(
      req.userId,
      exchangeAccountId
    );

    // 轉換為客戶端友好的格式：只返回有餘額的幣種
    const formattedBalances = Object.keys(balances)
      .filter(symbol => symbol !== 'free' && symbol !== 'used' && symbol !== 'total')
      .filter(symbol => balances[symbol].total > 0)
      .map(symbol => ({
        symbol,
        free: balances[symbol].free,
        used: balances[symbol].used,
        total: balances[symbol].total,
      }));

    res.json({
      exchangeAccountId,
      balances: formattedBalances,
      metadata: {
        timestamp: new Date().toISOString(),
        count: formattedBalances.length,
      },
    });
  } catch (error) {
    logError('Get exchange balances failed', error, { userId: req.userId });
    res.status(500).json({
      error: error instanceof Error ? error.message : '無法取得交易所餘額',
    });
  }
};

/**
 * 獲取交易所資產 (持倉)
 */
export const getExchangeAssets = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const exchangeAccountId = req.params.exchangeAccountId as string;

    if (!exchangeAccountId || exchangeAccountId === 'undefined') {
      res.status(400).json({ error: '缺少必要參數: exchangeAccountId' });
      return;
    }

    const assets = await ExchangeService.getExchangeAssets(
      req.userId,
      exchangeAccountId
    );

    res.json({
      exchangeAccountId,
      assets,
      metadata: {
        timestamp: new Date().toISOString(),
        count: assets.length,
      },
    });
  } catch (error) {
    logError('Get exchange assets failed', error, { userId: req.userId });
    res.status(500).json({
      error: error instanceof Error ? error.message : '無法取得交易所資產',
    });
  }
};

/**
 * 獲取用戶所有交易所帳戶
 */
export const getUserExchangeAccounts = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const accounts = await ExchangeService.getUserExchangeAccounts(req.userId);

    res.json({
      accounts,
      metadata: {
        timestamp: new Date().toISOString(),
        count: accounts.length,
      },
    });
  } catch (error) {
    logError('Get user exchange accounts failed', error, { userId: req.userId });
    res.status(500).json({
      error: '無法取得交易所帳戶清單',
    });
  }
};

/**
 * 斷開交易所連接
 */
export const disconnectExchange = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const exchangeAccountId = req.params.exchangeAccountId as string;

    if (!exchangeAccountId || exchangeAccountId === 'undefined') {
      res.status(400).json({ error: '缺少必要參數: exchangeAccountId' });
      return;
    }

    const result = await ExchangeService.disconnectExchange(
      req.userId,
      exchangeAccountId
    );

    res.json(result);
  } catch (error) {
    logError('Disconnect exchange failed', error, { userId: req.userId });
    res.status(500).json({
      error: error instanceof Error ? error.message : '斷開連接失敗',
    });
  }
};

/**
 * 獲取支持的交易所列表
 */
export const getSupportedExchanges = async (req: AuthRequest, res: Response) => {
  try {
    const exchanges = ExchangeService.getSupportedExchanges();

    res.json({
      exchanges,
      metadata: {
        timestamp: new Date().toISOString(),
        count: exchanges.length,
        message: `支持 ${exchanges.length} 個交易所`,
      },
    });
  } catch (error) {
    logError('Get supported exchanges failed', error);
    res.status(500).json({
      error: '無法取得支持的交易所列表',
    });
  }
};
