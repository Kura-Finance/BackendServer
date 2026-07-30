/** Exchange service — CCXT connect, sync, and Zero-Access encrypted snapshots. */

import ccxt from 'ccxt';
import { prisma } from '../../shared/lib/prisma';
import { appLogger, logDebug, logError, logBusinessEvent } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';
import { KURA_SUPPORTED_EXCHANGES, EXCHANGE_DISPLAY_MAP, getExchangeIcon } from '../../shared/lib/symbolsAndExchangesUtil';
import { EncryptionUtil } from '../../shared/lib/encryption';
import { AssetService } from '../../asset/services/assetService';
import { encryptPayload, zeroize } from '../../shared/crypto';
import {
  PayloadKeyService,
  KeyPairNotConfiguredError,
  PayloadKeyHandle,
} from '../../shared/services/payloadKeyService';
import { DemoService } from '../../demo/demoService';

/**
 * Phase 3 Zero-Access E2EE: encrypted exchange snapshot.
 *
 * Backend returns only metadata + payloadCiphertext + payloadKeyId; the client
 * unwraps SEK from payloadKeys with its privateKey, then decrypts each row.
 */
export interface EncryptedExchangeSnapshot {
  account: { id: string; exchange: string; displayName: string };
  payloadKeys: Array<{ id: string; scope: string; wrappedSek: string; algorithm: string }>;
  balances: Array<{
    symbol: string;
    cachedAt: Date;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>;
  assets: Array<{
    symbol: string;
    cachedAt: Date;
    payloadCiphertext: string;
    payloadKeyId: string;
  }>;
}

export class ExchangeService {
  /**
   * Verify exchange API credentials via a live CCXT call.
   */
  static async verifyExchangeConnection(
    exchange: string,
    apiKey: string,
    apiSecret: string,
    passphrase?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logDebug('Verifying exchange connection', { exchange });

      // Resolve CCXT exchange class
      const ExchangeClass = ccxt[exchange as keyof typeof ccxt] as any;
      if (!ExchangeClass) {
        return {
          success: false,
          error: `Unsupported exchange: ${exchange}`,
        };
      }

      // Create exchange instance
      const exchangeInstance = new ExchangeClass({
        apiKey,
        secret: apiSecret,
        password: passphrase, // some exchanges require a passphrase
        enableRateLimit: true,
      });

      // Probe connectivity via exchange time
      const timestamp = await exchangeInstance.fetchTime();
      logDebug('Exchange verification successful', {
        exchange,
        timestamp,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError('Exchange verification failed', error, { exchange });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Link a new exchange account for the user.
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

      // Verify connection
      const verification = await this.verifyExchangeConnection(
        exchange,
        apiKey,
        apiSecret,
        passphrase
      );

      if (!verification.success) {
        throw new Error(verification.error || 'Connection failed');
      }

      // Resolve display name
      const exchangeDisplayName = this.getExchangeDisplayName(exchange);

      // Encrypt sensitive credentials
      const encryptedApiKey = EncryptionUtil.encrypt(apiKey);
      const encryptedApiSecret = EncryptionUtil.encrypt(apiSecret);
      const encryptedPassphrase = passphrase ? EncryptionUtil.encrypt(passphrase) : null;

      // Persist account
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

      // Audit log
      AuditLogger.logExchangeOperation('CONNECT', userId, exchange, 'SUCCESS', {
        exchange,
        exchangeDisplayName,
        accountId: account.id,
      }, undefined, duration);

      return {
        ...account,
        icon: getExchangeIcon(account.exchange),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError('Failed to connect exchange', error, { userId, exchange });
      
      // Audit log (failure)
      AuditLogger.logExchangeOperation('CONNECT', userId, exchange, 'FAILURE', {
        exchange,
      }, errorMsg, duration);
      
      throw error;
    }
  }

  /**
   * Fetch exchange balances via CCXT and cache them.
   */
  static async getExchangeBalances(userId: string, exchangeAccountId: string) {
    const startTime = Date.now();
    try {
      logDebug('Fetching exchange balances', { userId, exchangeAccountId });

      if (!exchangeAccountId || exchangeAccountId === 'undefined') {
        throw new Error('Invalid account ID');
      }

      // Load account from DB
      const account = await prisma.exchangeAccount.findUnique({
        where: { id: exchangeAccountId },
      });

      if (!account || account.userId !== userId) {
        throw new Error('Account not found or access denied');
      }

      if (!account.isActive) {
        throw new Error('Account is inactive');
      }

      // Decrypt credentials
      const decryptedApiKey = EncryptionUtil.decrypt(account.apiKey);
      const decryptedApiSecret = EncryptionUtil.decrypt(account.apiSecret);
      const decryptedPassphrase = account.passphrase ? EncryptionUtil.decrypt(account.passphrase) : undefined;

      // Fetch balances via CCXT
      const ExchangeClass = ccxt[account.exchange as keyof typeof ccxt] as any;
      const exchangeInstance = new ExchangeClass({
        apiKey: decryptedApiKey,
        secret: decryptedApiSecret,
        password: decryptedPassphrase,
        enableRateLimit: true,
      });

      const balances = await exchangeInstance.fetchBalance();

      // Cache balances
      await this.cacheBalances(userId, exchangeAccountId, account.exchange, balances);

      const duration = Date.now() - startTime;
      logBusinessEvent('exchange_balances_fetched', userId, {
        exchange: account.exchange,
        symbolCount: Object.keys(balances).length,
      });

      // Audit log
      AuditLogger.logExchangeOperation('FETCH_BALANCE', userId, exchangeAccountId, 'SUCCESS', {
        exchange: account.exchange,
        symbolCount: Object.keys(balances).length,
      }, undefined, duration);

      return {
        account: {
          id: account.id,
          exchange: account.exchange,
          exchangeDisplayName: account.exchangeDisplayName,
        },
        balances,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError('Failed to fetch exchange balances', error, { userId, exchangeAccountId });
      
      // Audit log (failure)
      AuditLogger.logExchangeOperation('FETCH_BALANCE', userId, exchangeAccountId, 'FAILURE', {}, errorMsg, duration);
      
      throw error;
    }
  }

  /**
   * Sync exchange balances + assets and return an encrypted snapshot (Phase 3 Zero-Access E2EE only).
   *
   * Backend flow:
   *   1. CCXT fetchBalance → hold plaintext balances briefly
   *   2. Fetch USD prices per symbol via CCXT (ephemeral; not persisted)
   *   3. cacheBalances / cacheAssets encrypt with SEK into cache + AssetSnapshot
   *   4. Zeroize SEK, reload encrypted cache rows for the client to decrypt
   *
   * Note: futures positions are not zero-access encrypted yet (ephemeral on sync only).
   * After PR 5, positions are not persisted; a dedicated table is needed for encrypted history.
   */
  static async getBalancesAndAssets(
    userId: string,
    exchangeAccountId: string,
  ): Promise<EncryptedExchangeSnapshot> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.exchangeSnapshot(userId);
    }
    const startTime = Date.now();
    try {
      logDebug('Fetching exchange balances and assets', {
        userId,
        exchangeAccountId,
      });

      if (!exchangeAccountId || exchangeAccountId === 'undefined') {
        throw new Error('Invalid account ID');
      }

      const account = await prisma.exchangeAccount.findUnique({
        where: { id: exchangeAccountId },
      });

      if (!account || account.userId !== userId) {
        throw new Error('Account not found or access denied');
      }

      if (!account.isActive) {
        throw new Error('Account is inactive');
      }

      const decryptedApiKey = EncryptionUtil.decrypt(account.apiKey);
      const decryptedApiSecret = EncryptionUtil.decrypt(account.apiSecret);
      const decryptedPassphrase = account.passphrase
        ? EncryptionUtil.decrypt(account.passphrase)
        : undefined;

      const ExchangeClass = ccxt[account.exchange as keyof typeof ccxt] as any;
      const exchangeInstance = new ExchangeClass({
        apiKey: decryptedApiKey,
        secret: decryptedApiSecret,
        password: decryptedPassphrase,
        enableRateLimit: true,
      });

      const balances = await exchangeInstance.fetchBalance();

      await this.cacheBalances(userId, exchangeAccountId, account.exchange, balances);

      const formattedBalances = Object.keys(balances)
        .filter((symbol) => {
          if (
            symbol === 'free' ||
            symbol === 'used' ||
            symbol === 'total' ||
            symbol === 'info' ||
            symbol === 'datetime' ||
            symbol === 'timestamp'
          ) {
            return false;
          }
          const balance = balances[symbol];
          return (
            balance &&
            typeof balance === 'object' &&
            typeof balance.total === 'number' &&
            balance.total > 0
          );
        })
        .map((symbol) => ({
          symbol,
          free: Number(balances[symbol].free) || 0,
          used: Number(balances[symbol].used) || 0,
          total: Number(balances[symbol].total) || 0,
        }));

      const symbolsForPricing = formattedBalances.map((b) => b.symbol);
      const priceData = await this.getPrices(exchangeInstance, symbolsForPricing);

      const balancesWithUsd = formattedBalances.map((balance) => ({
        ...balance,
        usdPrice: priceData[balance.symbol]?.price || 0,
        usdValue: balance.total * (priceData[balance.symbol]?.price || 0),
      }));

      const assets = balancesWithUsd.filter((b) => b.free > 0);
      const assetsUsdTotal = assets.reduce((sum, a) => sum + a.usdValue, 0);

      await this.cacheAssets(userId, exchangeAccountId, account.exchange, assets, assetsUsdTotal);

      const duration = Date.now() - startTime;
      logBusinessEvent('exchange_balances_and_assets_fetched', userId, {
        exchange: account.exchange,
        balanceCount: balancesWithUsd.length,
        assetCount: assets.length,
        assetsUsdTotal,
      });

      AuditLogger.logExchangeOperation(
        'FETCH_BALANCES_AND_ASSETS',
        userId,
        exchangeAccountId,
        'SUCCESS',
        {
          exchange: account.exchange,
          balanceCount: balancesWithUsd.length,
          assetCount: assets.length,
          assetsUsdTotal: assetsUsdTotal.toFixed(2),
        },
        undefined,
        duration,
      );

      // Reload encrypted cache rows after sync
      return this.getEncryptedBalancesAndAssets(userId, exchangeAccountId);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError(
        'Failed to fetch exchange balances and assets',
        error,
        { userId, exchangeAccountId },
      );

      AuditLogger.logExchangeOperation(
        'FETCH_BALANCES_AND_ASSETS',
        userId,
        exchangeAccountId,
        'FAILURE',
        {},
        errorMsg,
        duration,
      );

      throw error;
    }
  }

  /**
   * Persist exchange spot holdings (Phase 3 Zero-Access E2EE only).
   *
   * 1. Create SEK for this sync (scope=`exchange_asset:{accountId}:{ts}`);
   *    throw if no keypair (caller should prompt keypair setup)
   * 2. Encrypt {holdings, price, value, percentageOfTotal} as payloadCiphertext
   * 3. Reuse SEK for `cryptoSpot:exchange:{accountId}` AssetSnapshot
   * 4. finally: release SEK immediately
   */
  private static async cacheAssets(
    userId: string,
    exchangeAccountId: string,
    exchange: string,
    assets: Array<{
      symbol: string;
      total: number;
      usdPrice: number;
      usdValue: number;
    }>,
    assetsUsdTotal: number,
  ) {
    let assetsKey: PayloadKeyHandle;
    try {
      assetsKey = await PayloadKeyService.createForUser(
        userId,
        `exchange_asset:${exchangeAccountId}:${Date.now()}`,
      );
    } catch (err) {
      if (err instanceof KeyPairNotConfiguredError) {
        appLogger.warn(
          'User has no E2EE key pair — exchange asset sync skipped. ' +
          'Client must POST /api/auth/keys/setup before syncing.',
          { userId, exchangeAccountId },
        );
      } else {
        logError('Failed to create exchange asset payload key', err, {
          userId,
          exchangeAccountId,
        });
      }
      throw err;
    }

    try {
      await prisma.exchangeCache.deleteMany({
        where: { userId, exchangeAccountId, kind: 'asset' },
      });

      if (assets.length > 0) {
        await prisma.exchangeCache.createMany({
          data: assets.map((asset) => {
            const holdings = Number(asset.total) || 0;
            const price = Number(asset.usdPrice) || 0;
            const value = Number(asset.usdValue) || 0;
            const percentageOfTotal =
              assetsUsdTotal > 0 ? (value / assetsUsdTotal) * 100 : 0;

            return {
              userId,
              exchangeAccountId,
              exchange,
              kind: 'asset',
              symbol: asset.symbol,
              payloadCiphertext: encryptPayload(assetsKey.sek, {
                holdings,
                price,
                value,
                percentageOfTotal,
              }),
              payloadKeyId: assetsKey.payloadKeyId,
            };
          }),
        });
      }

      // While SEK is in memory, encrypt this account's spot USD total into AssetSnapshot.
      // Sub-scoped metric "cryptoSpot:exchange:{accountId}"; client sums by base "cryptoSpot"
      // (includes DeBank tokens) when reading encrypted history.
      try {
        await AssetService.recordSnapshotFromPlaintext(userId, {
          [`cryptoSpot:exchange:${exchangeAccountId}`]: assetsUsdTotal,
        });
      } catch (err: unknown) {
        logDebug('Failed to record encrypted cryptoSpot snapshot for exchange', {
          userId,
          exchangeAccountId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      zeroize(assetsKey.sek);
    }
  }

  /**
   * Fetch token USD prices and 24h change via CCXT tickers.
   */
  private static async getPrices(exchangeInstance: any, symbols: string[]): Promise<Record<string, { price: number; change24h: number }>> {
    const prices: Record<string, { price: number; change24h: number }> = {};
    
    try {
      // Batch-fetch prices (USDT pairs)
      const tickers = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const pair = `${symbol}/USDT`;
            const ticker = await exchangeInstance.fetchTicker(pair);
            
            // Compute 24h change percent
            let change24h = 0;
            if (ticker.percentage !== undefined && ticker.percentage !== null) {
              // Prefer percentage field when present
              change24h = ticker.percentage;
            } else if (ticker.open && ticker.close) {
              // Else derive from open / close
              change24h = ((ticker.close - ticker.open) / ticker.open) * 100;
              change24h = parseFloat(change24h.toFixed(2));
            } else if (ticker.quoteVolume && ticker.baseVolume) {
              // Fallback: try other available fields
              logDebug(`Limited ticker data for ${symbol}`, {
                hasPercentage: ticker.percentage !== undefined,
                hasOpen: ticker.open !== undefined,
                hasClose: ticker.close !== undefined,
              });
            }
            
            return {
              symbol,
              price: ticker.last || ticker.close || 0,
              change24h,
            };
          } catch (err) {
            // Pair fetch failed — return zeros
            logDebug(`Failed to fetch price for ${symbol}`, {
              error: err instanceof Error ? err.message : String(err),
            });
            return { symbol, price: 0, change24h: 0 };
          }
        })
      );

      tickers.forEach(({ symbol, price, change24h }) => {
        prices[symbol] = { price, change24h };
      });

      logDebug('Fetched prices', {
        symbolCount: symbols.length,
        priceCount: Object.keys(prices).length,
      });
      return prices;
    } catch (error) {
      logDebug('Failed to fetch prices', {
        error: error instanceof Error ? error.message : String(error),
      });
      return prices;
    }
  }

  // getPositions (futures) removed in PR 5: zero-access needs a dedicated encrypted table;
  // plaintext positions must not be persisted. Sync no longer returns positions until then.

  /**
   * Cache balances (Phase 3 Zero-Access E2EE only).
   *
   * Obtain SEK (scope=`exchange_balance:{accountId}:{ts}`) and encrypt {free,used,total}.
   * No keypair → throw (caller should prompt keypair setup).
   */
  private static async cacheBalances(
    userId: string,
    exchangeAccountId: string,
    exchange: string,
    balances: any,
  ) {
    let balancesKey: PayloadKeyHandle;
    try {
      balancesKey = await PayloadKeyService.createForUser(
        userId,
        `exchange_balance:${exchangeAccountId}:${Date.now()}`,
      );
    } catch (err) {
      if (err instanceof KeyPairNotConfiguredError) {
        appLogger.warn(
          'User has no E2EE key pair — exchange balance sync skipped. ' +
          'Client must POST /api/auth/keys/setup before syncing.',
          { userId, exchangeAccountId },
        );
      } else {
        logError('Failed to create exchange balance payload key', err, {
          userId,
          exchangeAccountId,
        });
      }
      throw err;
    }

    try {
      const operations: Array<ReturnType<typeof prisma.exchangeCache.upsert>> = [];

      for (const symbol in balances) {
        if (
          symbol === 'free' ||
          symbol === 'used' ||
          symbol === 'total' ||
          symbol === 'info' ||
          symbol === 'datetime' ||
          symbol === 'timestamp'
        ) {
          continue;
        }

        const balance = balances[symbol];
        if (!balance || typeof balance !== 'object') {
          logDebug('Skipping invalid balance entry', { symbol, balanceType: typeof balance });
          continue;
        }

        const free = Number(balance.free) || 0;
        const used = Number(balance.used) || 0;
        const total = Number(balance.total) || 0;

        if (total > 0) {
          const payloadCiphertext = encryptPayload(balancesKey.sek, { free, used, total });
          const payloadKeyId = balancesKey.payloadKeyId;

          operations.push(
            prisma.exchangeCache.upsert({
              where: {
                userId_exchangeAccountId_kind_symbol: {
                  userId,
                  exchangeAccountId,
                  kind: 'balance',
                  symbol,
                },
              },
              update: {
                payloadCiphertext,
                payloadKeyId,
                updatedAt: new Date(),
              },
              create: {
                userId,
                exchangeAccountId,
                exchange,
                kind: 'balance',
                symbol,
                payloadCiphertext,
                payloadKeyId,
              },
            } as any),
          );
        }
      }

      if (operations.length > 0) {
        await Promise.all(operations);
      }
    } finally {
      zeroize(balancesKey.sek);
    }
  }

  /**
   * Phase 3 Zero-Access E2EE: load encrypted exchange balances + asset snapshot.
   *
   * - Selects metadata + payloadCiphertext + payloadKeyId only (no decrypt)
   * - Also returns deduped payloadKeys (wrappedSek list)
   * - Skips legacy rows without payloadCiphertext
   */
  static async getEncryptedBalancesAndAssets(
    userId: string,
    exchangeAccountId: string,
  ): Promise<EncryptedExchangeSnapshot> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.exchangeSnapshot(userId);
    }
    if (!exchangeAccountId || exchangeAccountId === 'undefined') {
      throw new Error('Invalid account ID');
    }

    const account = await prisma.exchangeAccount.findUnique({
      where: { id: exchangeAccountId },
      select: {
        id: true,
        userId: true,
        exchange: true,
        exchangeDisplayName: true,
      },
    });

    if (!account || account.userId !== userId) {
      throw new Error('Account not found or access denied');
    }

    const [balanceRows, assetRows] = await Promise.all([
      prisma.exchangeCache.findMany({
        where: {
          userId,
          exchangeAccountId,
          kind: 'balance',
          NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
        },
        select: {
          symbol: true,
          cachedAt: true,
          payloadCiphertext: true,
          payloadKeyId: true,
        },
        orderBy: { cachedAt: 'desc' },
      }),
      prisma.exchangeCache.findMany({
        where: {
          userId,
          exchangeAccountId,
          kind: 'asset',
          NOT: [{ payloadCiphertext: null }, { payloadKeyId: null }],
        },
        select: {
          symbol: true,
          cachedAt: true,
          payloadCiphertext: true,
          payloadKeyId: true,
        },
        orderBy: { cachedAt: 'desc' },
      }),
    ]);

    const balances = balanceRows
      .filter((r: any) => r.payloadCiphertext && r.payloadKeyId)
      .map((r: any) => ({
        symbol: r.symbol,
        cachedAt: r.cachedAt,
        payloadCiphertext: r.payloadCiphertext as string,
        payloadKeyId: r.payloadKeyId as string,
      }));

    const assets = assetRows
      .filter((r: any) => r.payloadCiphertext && r.payloadKeyId)
      .map((r: any) => ({
        symbol: r.symbol,
        cachedAt: r.cachedAt,
        payloadCiphertext: r.payloadCiphertext as string,
        payloadKeyId: r.payloadKeyId as string,
      }));

    const payloadKeyIds = Array.from(
      new Set([...balances.map((b) => b.payloadKeyId), ...assets.map((a) => a.payloadKeyId)]),
    );
    const payloadKeys = await PayloadKeyService.getForRead(userId, payloadKeyIds);

    return {
      account: {
        id: account.id,
        exchange: account.exchange,
        displayName: account.exchangeDisplayName,
      },
      payloadKeys,
      balances,
      assets,
    };
  }

  /**
   * List supported exchanges.
   */
  static getSupportedExchanges() {
    return KURA_SUPPORTED_EXCHANGES;
  }

  /**
   * Resolve exchange display name.
   */
  private static getExchangeDisplayName(exchange: string): string {
    return EXCHANGE_DISPLAY_MAP[exchange] || exchange.toUpperCase();
  }

  /**
   * Disconnect (delete) an exchange account.
   */
  static async disconnectExchange(userId: string, exchangeAccountId: string) {
    const startTime = Date.now();
    try {
      logDebug('Disconnecting exchange account', { userId, exchangeAccountId });

      if (!exchangeAccountId || exchangeAccountId === 'undefined') {
        throw new Error('Invalid account ID');
      }

      const account = await prisma.exchangeAccount.findUnique({
        where: { id: exchangeAccountId },
      });

      if (!account || account.userId !== userId) {
        throw new Error('Account not found or access denied');
      }

      // Delete account (ExchangeCache cleared via FK onDelete Cascade)
      await prisma.exchangeAccount.delete({
        where: { id: exchangeAccountId },
      });

      const duration = Date.now() - startTime;
      logBusinessEvent('exchange_account_disconnected', userId, {
        exchange: account.exchange,
      });

      // Audit log
      AuditLogger.logExchangeOperation('DISCONNECT', userId, exchangeAccountId, 'SUCCESS', {
        exchange: account.exchange,
      }, undefined, duration);

      return { success: true };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError('Failed to disconnect exchange', error, { userId, exchangeAccountId });
      
      // Audit log (failure)
      AuditLogger.logExchangeOperation('DISCONNECT', userId, exchangeAccountId, 'FAILURE', {}, errorMsg, duration);
      
      throw error;
    }
  }

  /**
   * List all exchange accounts linked by the user.
   */
  static async getUserExchangeAccounts(userId: string) {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.exchangeAccounts();
    }
    const accounts = await prisma.exchangeAccount.findMany({
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

    // Attach icon per account
    return accounts.map(account => ({
      ...account,
      icon: getExchangeIcon(account.exchange),
    }));
  }
}
