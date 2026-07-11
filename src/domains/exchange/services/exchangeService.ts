import ccxt from 'ccxt';
import { prisma } from '../../shared/lib/prisma';
import { logDebug, logError, logBusinessEvent } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';
import { KURA_SUPPORTED_EXCHANGES, EXCHANGE_DISPLAY_MAP } from '../constants';
import { EncryptionUtil } from '../../shared/lib/encryption';

/**
 * Exchange Service - CCXT Integration Layer
 * 支持全球 100+ 加密貨幣交易所
 */

export class ExchangeService {
  /**
   * 驗證交易所連接
   */
  static async verifyExchangeConnection(
    exchange: string,
    apiKey: string,
    apiSecret: string,
    passphrase?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logDebug('Verifying exchange connection', { exchange });

      // 獲取 CCXT 交易所類
      const ExchangeClass = ccxt[exchange as keyof typeof ccxt] as any;
      if (!ExchangeClass) {
        return {
          success: false,
          error: `不支持的交易所: ${exchange}`,
        };
      }

      // 創建交易所實例
      const exchangeInstance = new ExchangeClass({
        apiKey,
        secret: apiSecret,
        password: passphrase, // 某些交易所需要密語
        enableRateLimit: true,
      });

      // 測試連接 - 獲取交易所時間
      const timestamp = await exchangeInstance.fetchTime();
      logDebug('Exchange verification successful', {
        exchange,
        timestamp,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      logError('Exchange verification failed', error, { exchange });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 連結新的交易所帳戶
   */
  static async connectExchange(
    userId: string,
    exchange: string,
    apiKey: string,
    apiSecret: string,
    passphrase?: string
  ) {
    const startTime = Date.now();
    try {
      logDebug('Connecting exchange account', { userId, exchange });

      // 驗證連接
      const verification = await this.verifyExchangeConnection(
        exchange,
        apiKey,
        apiSecret,
        passphrase
      );

      if (!verification.success) {
        throw new Error(verification.error || '連接失敗');
      }

      // 獲取交易所顯示名稱
      const exchangeDisplayName = this.getExchangeDisplayName(exchange);

      // 加密敏感信息
      const encryptedApiKey = EncryptionUtil.encrypt(apiKey);
      const encryptedApiSecret = EncryptionUtil.encrypt(apiSecret);
      const encryptedPassphrase = passphrase ? EncryptionUtil.encrypt(passphrase) : null;

      // 保存到數據庫
      const account = await prisma.exchangeAccount.upsert({
        where: {
          userId_exchange: {
            userId,
            exchange,
          },
        },
        update: {
          apiKey: encryptedApiKey,
          apiSecret: encryptedApiSecret,
          passphrase: encryptedPassphrase,
          isActive: true,
          isVerified: true,
          lastVerifiedAt: new Date(),
          verificationError: null,
        },
        create: {
          userId,
          exchange,
          exchangeDisplayName,
          apiKey: encryptedApiKey,
          apiSecret: encryptedApiSecret,
          passphrase: encryptedPassphrase,
          isVerified: true,
          lastVerifiedAt: new Date(),
        },
      });

      const duration = Date.now() - startTime;
      logBusinessEvent('exchange_account_connected', userId, {
        exchange,
        exchangeDisplayName,
      });

      // 記錄審計日誌
      AuditLogger.logExchangeOperation('CONNECT', userId, exchange, 'SUCCESS', {
        exchange,
        exchangeDisplayName,
        accountId: account.id,
      }, undefined, duration);

      return account;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError('Failed to connect exchange', error, { userId, exchange });
      
      // 記錄審計日誌（失敗）
      AuditLogger.logExchangeOperation('CONNECT', userId, exchange, 'FAILURE', {
        exchange,
      }, errorMsg, duration);
      
      throw error;
    }
  }

  /**
   * 獲取交易所餘額
   */
  static async getExchangeBalances(userId: string, exchangeAccountId: string) {
    const startTime = Date.now();
    try {
      logDebug('Fetching exchange balances', { userId, exchangeAccountId });

      if (!exchangeAccountId || exchangeAccountId === 'undefined') {
        throw new Error('無效的帳戶 ID');
      }

      // 從數據庫獲取帳戶信息
      const account = await prisma.exchangeAccount.findUnique({
        where: { id: exchangeAccountId },
      });

      if (!account || account.userId !== userId) {
        throw new Error('帳戶不存在或無權限');
      }

      if (!account.isActive) {
        throw new Error('帳戶已停用');
      }

      // 解密敏感信息
      const decryptedApiKey = EncryptionUtil.decrypt(account.apiKey);
      const decryptedApiSecret = EncryptionUtil.decrypt(account.apiSecret);
      const decryptedPassphrase = account.passphrase ? EncryptionUtil.decrypt(account.passphrase) : undefined;

      // 使用 CCXT 獲取餘額
      const ExchangeClass = ccxt[account.exchange as keyof typeof ccxt] as any;
      const exchangeInstance = new ExchangeClass({
        apiKey: decryptedApiKey,
        secret: decryptedApiSecret,
        password: decryptedPassphrase,
        enableRateLimit: true,
      });

      const balances = await exchangeInstance.fetchBalance();

      // 快取餘額數據
      await this.cacheBalances(userId, exchangeAccountId, account.exchange, balances);

      const duration = Date.now() - startTime;
      logBusinessEvent('exchange_balances_fetched', userId, {
        exchange: account.exchange,
        symbolCount: Object.keys(balances).length,
      });

      // 記錄審計日誌
      AuditLogger.logExchangeOperation('FETCH_BALANCE', userId, exchangeAccountId, 'SUCCESS', {
        exchange: account.exchange,
        symbolCount: Object.keys(balances).length,
      }, undefined, duration);

      return balances;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError('Failed to fetch exchange balances', error, { userId, exchangeAccountId });
      
      // 記錄審計日誌（失敗）
      AuditLogger.logExchangeOperation('FETCH_BALANCE', userId, exchangeAccountId, 'FAILURE', {}, errorMsg, duration);
      
      throw error;
    }
  }

  /**
   * 獲取交易所資產 (持倉)
   */
  static async getExchangeAssets(userId: string, exchangeAccountId: string) {
    try {
      logDebug('Fetching exchange assets', { userId, exchangeAccountId });

      const balances = await this.getExchangeBalances(userId, exchangeAccountId);

      // 篩選出有餘額的幣種
      const assets: any[] = [];
      for (const symbol in balances) {
        if (
          symbol !== 'free' &&
          symbol !== 'used' &&
          symbol !== 'total' &&
          balances[symbol].free > 0
        ) {
          assets.push({
            symbol,
            free: balances[symbol].free,
            used: balances[symbol].used,
            total: balances[symbol].total,
          });
        }
      }

      return assets;
    } catch (error) {
      logError('Failed to fetch exchange assets', error, { userId, exchangeAccountId });
      throw error;
    }
  }

  /**
   * 快取餘額數據
   */
  private static async cacheBalances(
    userId: string,
    exchangeAccountId: string,
    exchange: string,
    balances: any
  ) {
    try {
      const operations = [];

      for (const symbol in balances) {
        if (symbol !== 'free' && symbol !== 'used' && symbol !== 'total') {
          operations.push(
            prisma.exchangeBalanceCache.upsert({
              where: {
                userId_exchangeAccountId_symbol: {
                  userId,
                  exchangeAccountId,
                  symbol,
                },
              },
              update: {
                free: balances[symbol].free,
                used: balances[symbol].used,
                total: balances[symbol].total,
                updatedAt: new Date(),
              },
              create: {
                userId,
                exchangeAccountId,
                exchange,
                symbol,
                free: balances[symbol].free,
                used: balances[symbol].used,
                total: balances[symbol].total,
              },
            })
          );
        }
      }

      if (operations.length > 0) {
        await Promise.all(operations);
      }

      // 更新同步日誌
      await prisma.exchangeSyncLog.upsert({
        where: { userId },
        update: {
          balancesSyncedAt: new Date(),
        },
        create: {
          userId,
          balancesSyncedAt: new Date(),
        },
      });
    } catch (error) {
      logError('Failed to cache balances', error, { userId, exchangeAccountId });
    }
  }

  /**
   * 獲取所有支持的交易所列表
   */
  static getSupportedExchanges() {
    return KURA_SUPPORTED_EXCHANGES;
  }

  /**
   * 獲取交易所顯示名稱
   */
  private static getExchangeDisplayName(exchange: string): string {
    return EXCHANGE_DISPLAY_MAP[exchange] || exchange.toUpperCase();
  }

  /**
   * 斷開交易所連接
   */
  static async disconnectExchange(userId: string, exchangeAccountId: string) {
    const startTime = Date.now();
    try {
      logDebug('Disconnecting exchange account', { userId, exchangeAccountId });

      if (!exchangeAccountId || exchangeAccountId === 'undefined') {
        throw new Error('無效的帳戶 ID');
      }

      const account = await prisma.exchangeAccount.findUnique({
        where: { id: exchangeAccountId },
      });

      if (!account || account.userId !== userId) {
        throw new Error('帳戶不存在或無權限');
      }

      // 刪除帳戶及其相關快取
      await Promise.all([
        prisma.exchangeAccount.delete({
          where: { id: exchangeAccountId },
        }),
        prisma.exchangeBalanceCache.deleteMany({
          where: {
            userId,
            exchangeAccountId,
          },
        }),
        prisma.exchangeAssetCache.deleteMany({
          where: {
            userId,
            exchangeAccountId,
          },
        }),
      ]);

      const duration = Date.now() - startTime;
      logBusinessEvent('exchange_account_disconnected', userId, {
        exchange: account.exchange,
      });

      // 記錄審計日誌
      AuditLogger.logExchangeOperation('DISCONNECT', userId, exchangeAccountId, 'SUCCESS', {
        exchange: account.exchange,
      }, undefined, duration);

      return { success: true };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError('Failed to disconnect exchange', error, { userId, exchangeAccountId });
      
      // 記錄審計日誌（失敗）
      AuditLogger.logExchangeOperation('DISCONNECT', userId, exchangeAccountId, 'FAILURE', {}, errorMsg, duration);
      
      throw error;
    }
  }

  /**
   * 獲取用戶連接的所有交易所帳戶
   */
  static async getUserExchangeAccounts(userId: string) {
    return await prisma.exchangeAccount.findMany({
      where: { userId },
      select: {
        id: true,
        exchange: true,
        exchangeDisplayName: true,
        isActive: true,
        isVerified: true,
        lastVerifiedAt: true,
        createdAt: true,
      },
    });
  }
}
