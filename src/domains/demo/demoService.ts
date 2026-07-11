import { randomUUID } from 'crypto';
import { prisma } from '../shared/lib/prisma';
import { generateSEK, sealForPublicKey, encryptPayload, zeroize } from '../shared/crypto';
import type { EncryptedFinanceSnapshot } from '../plaid/services/plaidCacheService';
import type { EncryptedExchangeSnapshot } from '../exchange/services/exchangeService';
import type { EncryptedAssetHistoryResponse } from '../asset/services/assetService';
import { getExchangeIcon } from '../shared/lib/symbolsAndExchangesUtil';

/**
 * Demo Mode（App Store 審核專用）
 *
 * 背景：本 App 的儀表板資料走 zero-access E2EE，且 Plaid / 交易所 / DeBank 都需要
 * 真實帳戶才有資料。Apple 審核員在全新裝置上登入 demo 帳號後，無法連真實銀行 /
 * 交易所，dashboard 會是空的 → 觸發 Guideline 2.1(a) 駁回。
 *
 * 解法：對 demo 帳號回傳「樣本資料」，但仍用該帳號**真實的 publicKey** 把資料 seal +
 * 加密成與正式端點完全相同的結構。前端照常用 privateKey 解密渲染，**完全不需改前端**。
 *
 * demo 帳號判定：email 為 Privy 測試帳號網域（@privy.io，真實用戶無法註冊），
 * 或列在 DEMO_USER_EMAILS env（逗號分隔）。非 demo 帳號完全不受影響。
 */

const ALGORITHM = 'x25519-sealedbox+aes-256-gcm';
const DEMO_EXCHANGE_ACCOUNT_ID = 'demo-binance';
const DEMO_EXCHANGE = 'binance';

interface SealedScope {
  sek: Uint8Array;
  wrappedSek: string;
  payloadKeyId: string;
  scope: string;
}

interface PayloadKeyView {
  id: string;
  scope: string;
  wrappedSek: string;
  algorithm: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export class DemoService {
  /** 由 email 判定是否 demo 帳號（不查 DB）。 */
  static isDemoEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    const e = email.trim().toLowerCase();
    if (e.endsWith('@privy.io')) return true;
    const allow = (process.env.DEMO_USER_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return allow.includes(e);
  }

  /** 查 DB 判定 userId 是否 demo 帳號。 */
  static async isDemoUser(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return DemoService.isDemoEmail(user?.email ?? null);
  }

  static get exchangeAccountId(): string {
    return DEMO_EXCHANGE_ACCOUNT_ID;
  }

  /** 取得 demo 用戶 publicKey；未 setup keypair 回 null（caller 回空資料）。 */
  private static async getPublicKey(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicKey: true },
    });
    return user?.publicKey ?? null;
  }

  private static async sealScope(publicKey: string, scope: string): Promise<SealedScope> {
    const sek = generateSEK();
    const wrappedSek = await sealForPublicKey(sek, publicKey);
    return { sek, wrappedSek, payloadKeyId: randomUUID(), scope };
  }

  private static keyView(s: SealedScope): PayloadKeyView {
    return { id: s.payloadKeyId, scope: s.scope, wrappedSek: s.wrappedSek, algorithm: ALGORITHM };
  }

  // ── Plaid 財務快照 ────────────────────────────────────────────────
  static async plaidSnapshot(userId: string): Promise<EncryptedFinanceSnapshot> {
    const publicKey = await DemoService.getPublicKey(userId);
    const empty: EncryptedFinanceSnapshot = {
      payloadKeys: [],
      accounts: [],
      transactions: [],
      investmentAccounts: [],
      investments: [],
      partial: false,
      failedItemIds: [],
    };
    if (!publicKey) return empty;

    const now = new Date();
    const key = await DemoService.sealScope(publicKey, 'plaid:demo');
    try {
      const enc = (obj: unknown) => encryptPayload(key.sek, obj);

      const accounts: EncryptedFinanceSnapshot['accounts'] = [
        {
          accountId: 'demo-acct-checking',
          plaidItemId: 'demo-item-chase',
          type: 'checking',
          bucket: 'banking',
          cachedAt: now,
          payloadCiphertext: enc({
            name: 'Chase · Total Checking',
            balance: 8450.32,
            institutionName: 'Chase',
            logo: null,
            plaidLogo: null,
            apy: null,
            mask: '4821',
          }),
          payloadKeyId: key.payloadKeyId,
        },
        {
          accountId: 'demo-acct-savings',
          plaidItemId: 'demo-item-chase',
          type: 'savings',
          bucket: 'banking',
          cachedAt: now,
          payloadCiphertext: enc({
            name: 'Chase · Premier Savings',
            balance: 25600.0,
            institutionName: 'Chase',
            logo: null,
            plaidLogo: null,
            apy: 4.25,
            mask: '7733',
          }),
          payloadKeyId: key.payloadKeyId,
        },
        {
          accountId: 'demo-acct-credit',
          plaidItemId: 'demo-item-amex',
          type: 'credit',
          bucket: 'banking',
          cachedAt: now,
          payloadCiphertext: enc({
            name: 'Amex · Platinum Card',
            balance: 1240.55,
            institutionName: 'American Express',
            logo: null,
            plaidLogo: null,
            apy: null,
            mask: '1009',
          }),
          payloadKeyId: key.payloadKeyId,
        },
      ];

      const txDefs = [
        { merchant: 'Whole Foods Market', amount: 84.21, category: 'Groceries', pfc: 'FOOD_AND_DRINK', recurring: false, subscription: false },
        { merchant: 'Apple', amount: 9.99, category: 'Subscription', pfc: 'GENERAL_SERVICES', recurring: true, subscription: true },
        { merchant: 'Netflix', amount: 15.49, category: 'Subscription', pfc: 'ENTERTAINMENT', recurring: true, subscription: true },
        { merchant: 'Uber', amount: 23.4, category: 'Transportation', pfc: 'TRANSPORTATION', recurring: false, subscription: false },
        { merchant: 'Starbucks', amount: 6.75, category: 'Coffee Shops', pfc: 'FOOD_AND_DRINK', recurring: false, subscription: false },
        { merchant: 'Acme Corp Payroll', amount: -5200.0, category: 'Income', pfc: 'INCOME', recurring: true, subscription: false },
      ];

      const transactions: EncryptedFinanceSnapshot['transactions'] = txDefs.map((t, i) => {
        const d = new Date(now);
        d.setUTCDate(now.getUTCDate() - i * 3);
        return {
          transactionId: `demo-tx-${i}`,
          accountId: 'demo-acct-checking',
          plaidItemId: 'demo-item-chase',
          date: isoDate(d),
          month: monthKey(d),
          isPending: false,
          isRecurring: t.recurring,
          isSubscription: t.subscription,
          cachedAt: now,
          payloadCiphertext: enc({
            amount: t.amount,
            merchant: t.merchant,
            category: t.category,
            type: t.amount < 0 ? 'credit' : 'debit',
            personalFinanceCategory: t.pfc,
            recurringFrequency: t.recurring ? 'MONTHLY' : null,
            enrichedMerchantName: t.merchant,
            merchantLogo: null,
            merchantCategory: t.category,
            accountName: 'Chase · Total Checking',
            accountType: 'checking',
          }),
          payloadKeyId: key.payloadKeyId,
        };
      });

      const investmentAccounts: EncryptedFinanceSnapshot['investmentAccounts'] = [
        {
          accountId: 'demo-inv-acct-robinhood',
          cachedAt: now,
          payloadCiphertext: enc({
            name: 'Robinhood · Individual',
            institutionName: 'Robinhood',
            logo: null,
            plaidLogo: null,
          }),
          payloadKeyId: key.payloadKeyId,
        },
      ];

      const invDefs = [
        { symbol: 'AAPL', name: 'Apple Inc.', holdings: 25, price: 213.4, change24h: 1.2, type: 'stock' },
        { symbol: 'TSLA', name: 'Tesla Inc.', holdings: 10, price: 248.5, change24h: -2.1, type: 'stock' },
        { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', holdings: 15, price: 512.3, change24h: 0.4, type: 'etf' },
      ];

      const investments: EncryptedFinanceSnapshot['investments'] = invDefs.map((s) => ({
        investmentId: `demo-inv-${s.symbol}`,
        accountId: 'demo-inv-acct-robinhood',
        type: s.type,
        cachedAt: now,
        payloadCiphertext: enc({
          symbol: s.symbol,
          name: s.name,
          holdings: s.holdings,
          currentPrice: s.price,
          change24h: s.change24h,
          logo: null,
        }),
        payloadKeyId: key.payloadKeyId,
      }));

      return {
        payloadKeys: [DemoService.keyView(key)],
        accounts,
        transactions,
        investmentAccounts,
        investments,
        partial: false,
        failedItemIds: [],
      };
    } finally {
      zeroize(key.sek);
    }
  }

  // ── 交易所帳戶列表 ────────────────────────────────────────────────
  static exchangeAccounts(): Array<{
    id: string;
    exchange: string;
    exchangeDisplayName: string;
    isActive: boolean;
    isVerified: boolean;
    lastVerifiedAt: Date;
    createdAt: Date;
    icon: string;
  }> {
    const now = new Date();
    return [
      {
        id: DEMO_EXCHANGE_ACCOUNT_ID,
        exchange: DEMO_EXCHANGE,
        exchangeDisplayName: 'Binance',
        isActive: true,
        isVerified: true,
        lastVerifiedAt: now,
        createdAt: now,
        icon: getExchangeIcon(DEMO_EXCHANGE),
      },
    ];
  }

  // ── 交易所餘額 + 資產 ─────────────────────────────────────────────
  static async exchangeSnapshot(userId: string): Promise<EncryptedExchangeSnapshot> {
    const publicKey = await DemoService.getPublicKey(userId);
    const account = {
      id: DEMO_EXCHANGE_ACCOUNT_ID,
      exchange: DEMO_EXCHANGE,
      displayName: 'Binance',
    };
    if (!publicKey) {
      return { account, payloadKeys: [], balances: [], assets: [] };
    }

    const now = new Date();
    const key = await DemoService.sealScope(publicKey, `exchange:demo:${DEMO_EXCHANGE_ACCOUNT_ID}`);
    try {
      const enc = (obj: unknown) => encryptPayload(key.sek, obj);

      const holdings = [
        { symbol: 'BTC', amount: 0.5, price: 96000 },
        { symbol: 'ETH', amount: 4, price: 3600 },
        { symbol: 'USDT', amount: 3000, price: 1 },
      ];
      const totalValue = holdings.reduce((sum, h) => sum + h.amount * h.price, 0);

      const balances = holdings.map((h) => ({
        symbol: h.symbol,
        cachedAt: now,
        payloadCiphertext: enc({ free: h.amount, used: 0, total: h.amount }),
        payloadKeyId: key.payloadKeyId,
      }));

      const assets = holdings.map((h) => {
        const value = h.amount * h.price;
        return {
          symbol: h.symbol,
          cachedAt: now,
          payloadCiphertext: enc({
            holdings: h.amount,
            price: h.price,
            value,
            percentageOfTotal: totalValue > 0 ? (value / totalValue) * 100 : 0,
          }),
          payloadKeyId: key.payloadKeyId,
        };
      });

      return { account, payloadKeys: [DemoService.keyView(key)], balances, assets };
    } finally {
      zeroize(key.sek);
    }
  }

  // ── 資產歷史（淨值曲線）──────────────────────────────────────────
  static async assetHistory(userId: string, days: number): Promise<EncryptedAssetHistoryResponse> {
    const publicKey = await DemoService.getPublicKey(userId);
    if (!publicKey) {
      return { userId, payloadKeys: [], snapshots: [] };
    }

    const span = Math.min(Math.max(days, 1), 365);
    const key = await DemoService.sealScope(publicKey, 'asset_snapshot:demo');
    try {
      const enc = (value: number) => encryptPayload(key.sek, { value });

      // 三條 metric：銀行現金、Plaid 投資、交易所現貨。帶緩升趨勢 + 微噪。
      const metrics: Array<{ metric: string; base: number; growth: number; amp: number }> = [
        { metric: 'cashFlow', base: 32000, growth: 30, amp: 400 },
        { metric: 'plaidInvestment', base: 15000, growth: 18, amp: 350 },
        { metric: `cryptoSpot:exchange:${DEMO_EXCHANGE_ACCOUNT_ID}`, base: 60000, growth: 55, amp: 1800 },
      ];

      const snapshots: EncryptedAssetHistoryResponse['snapshots'] = [];
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      for (let i = span - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - i);
        const dayIndex = span - 1 - i;
        for (const m of metrics) {
          const wave = Math.sin(dayIndex / 4) * m.amp;
          const value = Math.round((m.base + m.growth * dayIndex + wave) * 100) / 100;
          snapshots.push({
            id: `demo-snap-${m.metric}-${isoDate(d)}`,
            metric: m.metric,
            recordedAt: d,
            payloadCiphertext: enc(value),
            payloadKeyId: key.payloadKeyId,
          });
        }
      }

      return { userId, payloadKeys: [DemoService.keyView(key)], snapshots };
    } finally {
      zeroize(key.sek);
    }
  }
}
