import { randomUUID } from 'crypto';
import { getDemoBaseUrl } from '../../config/brand';
import { prisma } from '../shared/lib/prisma';
import { generateSEK, sealForPublicKey, encryptPayload, zeroize } from '../shared/crypto';
import type { EncryptedFinanceSnapshot } from '../plaid/services/plaidCacheService';
import type { EncryptedExchangeSnapshot } from '../exchange/services/exchangeService';
import type { EncryptedAssetHistoryResponse } from '../asset/services/assetService';
import type {
  BridgeCustomerType,
  BridgeDepositInstructions,
  BridgeEndorsementType,
  CreatePayoutAddressParams,
  CustomerStatusResult,
  DepositPayerInfo,
  DepositResult,
  EndorsementLinkResult,
  ExternalAccountResult,
  KycLinkResult,
  LiquidationAddressResult,
  PayoutDrainResult,
  PayoutLiquidationAddressResult,
  TransferResult,
  VirtualAccountResult,
} from '../bridge/models/types';
import {
  EMPTY_DEPOSIT_PAYER,
  LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC,
  resolveOnRampMinDeposit,
  resolvePayoutMinDeposit,
  resolveTronUsdtMinDeposit,
} from '../bridge/models/types';
import { getExchangeIcon } from '../shared/lib/symbolsAndExchangesUtil';

/**
 * Demo Mode (App Store review).
 *
 * Dashboard data is zero-access E2EE, and Plaid / exchanges / DeBank / Bridge need real
 * accounts. Apple reviewers on a fresh device cannot link those services, so the dashboard
 * would be empty and fail Guideline 2.1(a).
 *
 * Fix: return sample payloads for demo accounts, sealed + encrypted with that account's
 * real publicKey into the same shape as production endpoints. The client decrypts with its
 * privateKey as usual — no frontend changes.
 *
 * Demo accounts: email on Privy's test domain (@privy.io; real users cannot register), or
 * listed in DEMO_USER_EMAILS (comma-separated). Non-demo accounts are unaffected.
 */

const ALGORITHM = 'x25519-sealedbox+aes-256-gcm';
const DEMO_EXCHANGE_ACCOUNT_ID = 'demo-binance';
const DEMO_EXCHANGE = 'binance';

const DEMO_BRIDGE_CUSTOMER_ID = 'demo-bridge-customer';
const DEMO_KYC_LINK_ID = 'demo-kyc-link';
const DEMO_LIQUIDATION_ADDRESS_ID = 'demo-la-tron-usdt';
const DEMO_TRANSFER_ONRAMP_ID = 'demo-transfer-onramp-usd';
const DEMO_ONRAMP_FEE_PERCENT = '0.85';
const DEMO_CRYPTO_FEE_PERCENT = '0.85';
const DEMO_PAYOUT_FEE_PERCENT = '0.85';
const DEMO_TRON_DEPOSIT_ADDRESS = 'TDemoBridgeTronUsdtDepositAddress000001';

/** All Cash Deposit fiat currencies shown in the Bridge VA on-ramp UI. */
const DEMO_ONRAMP_CURRENCIES = ['usd', 'eur', 'gbp', 'mxn', 'brl', 'cop'] as const;
type DemoOnrampCurrency = (typeof DEMO_ONRAMP_CURRENCIES)[number];

interface DemoOnrampConfig {
  currency: DemoOnrampCurrency;
  beneficiaryLabel: string;
  bankName: string;
  paymentRails: string[];
  primaryRail: string;
  depositInstructions: Omit<BridgeDepositInstructions, 'currency' | 'payment_rail' | 'payment_rails'>;
}

const DEMO_ONRAMP_CONFIGS: DemoOnrampConfig[] = [
  {
    currency: 'usd',
    beneficiaryLabel: 'Bridge Demo · USD',
    bankName: 'Lead Bank',
    paymentRails: ['ach_push', 'wire'],
    primaryRail: 'ach_push',
    depositInstructions: {
      bank_beneficiary_name: 'Bridge Demo · USD On-ramp',
      bank_account_number: '9876543210',
      bank_routing_number: '101019644',
    },
  },
  {
    currency: 'eur',
    beneficiaryLabel: 'Bridge Demo · EUR',
    bankName: 'Demo Bank EU',
    paymentRails: ['sepa'],
    primaryRail: 'sepa',
    depositInstructions: {
      bank_beneficiary_name: 'Bridge Demo · EUR On-ramp',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
    },
  },
  {
    currency: 'gbp',
    beneficiaryLabel: 'Bridge Demo · GBP',
    bankName: 'Demo Bank UK',
    paymentRails: ['faster_payments'],
    primaryRail: 'faster_payments',
    depositInstructions: {
      bank_beneficiary_name: 'Bridge Demo · GBP On-ramp',
      bank_account_number: '12345678',
      bank_routing_number: '040004',
    },
  },
  {
    currency: 'mxn',
    beneficiaryLabel: 'Bridge Demo · MXN',
    bankName: 'Demo Bank MX',
    paymentRails: ['spei'],
    primaryRail: 'spei',
    depositInstructions: {
      bank_beneficiary_name: 'Bridge Demo · MXN On-ramp',
      bank_account_number: '012345678901234567',
    },
  },
  {
    currency: 'brl',
    beneficiaryLabel: 'Bridge Demo · BRL',
    bankName: 'Demo Bank BR',
    paymentRails: ['pix'],
    primaryRail: 'pix',
    depositInstructions: {
      bank_beneficiary_name: 'Bridge Demo · BRL On-ramp',
      bank_account_number: '000201265800014530001234567890',
    },
  },
  {
    currency: 'cop',
    beneficiaryLabel: 'Bridge Demo · COP',
    bankName: 'Demo Bank CO',
    paymentRails: ['pse', 'bre-b'],
    primaryRail: 'pse',
    depositInstructions: {
      bank_beneficiary_name: 'Bridge Demo · COP On-ramp',
      bank_account_number: '1234567890',
    },
  },
];

interface DemoExternalAccountConfig {
  currency: DemoOnrampCurrency;
  bridgeExternalAccountId: string;
  bankName: string;
  accountOwnerName: string;
  last4: string;
}

const DEMO_EXTERNAL_ACCOUNT_CONFIGS: DemoExternalAccountConfig[] = [
  {
    currency: 'usd',
    bridgeExternalAccountId: 'demo-ext-acct-usd',
    bankName: 'Chase',
    accountOwnerName: 'Demo User',
    last4: '4821',
  },
  {
    currency: 'eur',
    bridgeExternalAccountId: 'demo-ext-acct-eur',
    bankName: 'Deutsche Bank',
    accountOwnerName: 'Demo User',
    last4: '3000',
  },
  {
    currency: 'gbp',
    bridgeExternalAccountId: 'demo-ext-acct-gbp',
    bankName: 'Barclays',
    accountOwnerName: 'Demo User',
    last4: '5678',
  },
  {
    currency: 'mxn',
    bridgeExternalAccountId: 'demo-ext-acct-mxn',
    bankName: 'BBVA Mexico',
    accountOwnerName: 'Demo User',
    last4: '4567',
  },
  {
    currency: 'brl',
    bridgeExternalAccountId: 'demo-ext-acct-brl',
    bankName: 'Itaú',
    accountOwnerName: 'Demo User',
    last4: '8901',
  },
  {
    currency: 'cop',
    bridgeExternalAccountId: 'demo-ext-acct-cop',
    bankName: 'Bancolombia',
    accountOwnerName: 'Demo User',
    last4: '2345',
  },
];

const DEMO_PAYOUT_RAILS: Array<{
  destinationRail: string;
  destinationCurrency: DemoOnrampCurrency;
  externalAccountId: string;
}> = [
  { destinationRail: 'ach_same_day', destinationCurrency: 'usd', externalAccountId: 'demo-ext-acct-usd' },
  { destinationRail: 'wire', destinationCurrency: 'usd', externalAccountId: 'demo-ext-acct-usd' },
  { destinationRail: 'faster_payments', destinationCurrency: 'gbp', externalAccountId: 'demo-ext-acct-gbp' },
  { destinationRail: 'sepa', destinationCurrency: 'eur', externalAccountId: 'demo-ext-acct-eur' },
  { destinationRail: 'pix', destinationCurrency: 'brl', externalAccountId: 'demo-ext-acct-brl' },
  { destinationRail: 'spei', destinationCurrency: 'mxn', externalAccountId: 'demo-ext-acct-mxn' },
  { destinationRail: 'bre_b', destinationCurrency: 'cop', externalAccountId: 'demo-ext-acct-cop' },
  { destinationRail: 'co_bank_transfer', destinationCurrency: 'cop', externalAccountId: 'demo-ext-acct-cop' },
];

function demoVaId(currency: string): string {
  return `demo-va-${currency.toLowerCase()}-base-usdc`;
}

function normalizeOnrampCurrency(currency: string): DemoOnrampCurrency {
  const normalized = currency.toLowerCase() as DemoOnrampCurrency;
  return DEMO_ONRAMP_CURRENCIES.includes(normalized) ? normalized : 'usd';
}

function demoOnrampConfig(currency: string): DemoOnrampConfig {
  const normalized = normalizeOnrampCurrency(currency);
  return DEMO_ONRAMP_CONFIGS.find((c) => c.currency === normalized) ?? DEMO_ONRAMP_CONFIGS[0]!;
}

function demoExternalConfig(currency: string): DemoExternalAccountConfig {
  const normalized = normalizeOnrampCurrency(currency);
  return (
    DEMO_EXTERNAL_ACCOUNT_CONFIGS.find((c) => c.currency === normalized)
    ?? DEMO_EXTERNAL_ACCOUNT_CONFIGS[0]!
  );
}

function demoPayoutLaId(destinationRail: string, destinationCurrency: string): string {
  return `demo-payout-la-${destinationCurrency}-${destinationRail.replace(/[^a-z0-9]+/gi, '-')}`;
}

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

function demoDepositPayer(currency: DemoOnrampCurrency): DepositPayerInfo {
  const payers: Record<DemoOnrampCurrency, DepositPayerInfo> = {
    usd: {
      paymentRail: 'ach_push',
      senderName: 'Demo Sender LLC',
      accountLast4: null,
      senderBankRoutingNumber: '021000021',
      senderDescription: 'ACH DEMO DEPOSIT',
    },
    eur: {
      paymentRail: 'sepa',
      senderName: 'Demo Sender GmbH',
      accountLast4: '4321',
      senderBankRoutingNumber: null,
      senderDescription: null,
    },
    gbp: {
      paymentRail: 'faster_payments',
      senderName: 'John Smith',
      accountLast4: '5678',
      senderBankRoutingNumber: null,
      senderDescription: 'Invoice demo',
    },
    mxn: {
      paymentRail: 'spei',
      senderName: 'Demo Sender SA',
      accountLast4: null,
      senderBankRoutingNumber: null,
      senderDescription: null,
    },
    brl: {
      paymentRail: 'pix',
      senderName: 'Demo Sender LTDA',
      accountLast4: null,
      senderBankRoutingNumber: null,
      senderDescription: null,
    },
    cop: {
      paymentRail: 'pse',
      senderName: 'Demo Sender SAS',
      accountLast4: null,
      senderBankRoutingNumber: null,
      senderDescription: null,
    },
  };
  return payers[currency];
}

export class DemoService {
  /** Whether email is a demo account (no DB lookup). */
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

  /** Whether userId is a demo account (loads email from DB). */
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

  static get bridgeTransferId(): string {
    return DEMO_TRANSFER_ONRAMP_ID;
  }

  /** @deprecated Prefer bridgeExternalAccountIdFor('usd'). */
  static get bridgeExternalAccountId(): string {
    return demoExternalConfig('usd').bridgeExternalAccountId;
  }

  static bridgeExternalAccountIdFor(currency = 'usd'): string {
    return demoExternalConfig(currency).bridgeExternalAccountId;
  }

  static bridgeExternalAccountIds(): string[] {
    return DEMO_EXTERNAL_ACCOUNT_CONFIGS.map((c) => c.bridgeExternalAccountId);
  }

  static isBridgeExternalAccountId(externalAccountId: string): boolean {
    return DemoService.bridgeExternalAccountIds().includes(externalAccountId);
  }

  /** Demo user publicKey; null if keypair not set up (caller should return empty data). */
  private static async getPublicKey(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { publicKey: true },
    });
    return user?.publicKey ?? null;
  }

  private static async getWalletAddress(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { scaAddress: true, walletAddress: true },
    });
    return (
      user?.scaAddress
      ?? user?.walletAddress
      ?? '0xDemo0000000000000000000000000000000001'
    );
  }

  private static demoDaysAgoIso(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString();
  }

  private static async sealScope(publicKey: string, scope: string): Promise<SealedScope> {
    const sek = generateSEK();
    const wrappedSek = await sealForPublicKey(sek, publicKey);
    return { sek, wrappedSek, payloadKeyId: randomUUID(), scope };
  }

  private static keyView(s: SealedScope): PayloadKeyView {
    return { id: s.payloadKeyId, scope: s.scope, wrappedSek: s.wrappedSek, algorithm: ALGORITHM };
  }

  // ── Plaid finance snapshot ────────────────────────────────────────
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

  // ── Exchange account list ─────────────────────────────────────────
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

  // ── Exchange balances + assets ────────────────────────────────────
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

  // ── Asset history (net-worth curve) ───────────────────────────────
  static async assetHistory(userId: string, days: number): Promise<EncryptedAssetHistoryResponse> {
    const publicKey = await DemoService.getPublicKey(userId);
    if (!publicKey) {
      return { userId, payloadKeys: [], snapshots: [] };
    }

    const span = Math.min(Math.max(days, 1), 365);
    const key = await DemoService.sealScope(publicKey, 'asset_snapshot:demo');
    try {
      const enc = (value: number) => encryptPayload(key.sek, { value });

      // Two metrics: Plaid investments + exchange spot; gentle uptrend + light noise.
      const metrics: Array<{ metric: string; base: number; growth: number; amp: number }> = [
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

  // ── Bridge on/off-ramp (full UI without a real Bridge account) ────

  static bridgeKycLink(customerType: BridgeCustomerType = 'individual'): KycLinkResult {
    return {
      bridgeCustomerId: DEMO_BRIDGE_CUSTOMER_ID,
      kycLinkId: DEMO_KYC_LINK_ID,
      customerType,
      kycLink: `${getDemoBaseUrl()}/bridge/kyc`,
      tosLink: `${getDemoBaseUrl()}/bridge/tos`,
      kycStatus: 'approved',
      tosStatus: 'approved',
    };
  }

  static bridgeEndorsementLink(
    endorsement: BridgeEndorsementType,
    currency?: string,
  ): EndorsementLinkResult {
    return {
      bridgeCustomerId: DEMO_BRIDGE_CUSTOMER_ID,
      endorsement,
      kycLink: `${getDemoBaseUrl()}/bridge/endorsement/${endorsement}`,
      ...(currency ? { currency } : {}),
    };
  }

  static bridgeCustomerStatus(): CustomerStatusResult {
    const endorsements: Array<{ name: BridgeEndorsementType; status: string }> = [
      'base',
      'sepa',
      'faster_payments',
      'spei',
      'pix',
      'cop',
    ].map((name) => ({ name: name as BridgeEndorsementType, status: 'approved' }));

    return {
      bridgeCustomerId: DEMO_BRIDGE_CUSTOMER_ID,
      customerType: 'individual',
      kycStatus: 'approved',
      tosStatus: 'approved',
      endorsements,
      canTransact: true,
      customerNamedPayoutConfigured: true,
      rejectionReasons: [],
    };
  }

  static async bridgeVirtualAccount(
    userId: string,
    sourceCurrency = 'usd',
  ): Promise<VirtualAccountResult> {
    const config = demoOnrampConfig(sourceCurrency);
    const destinationAddress = await DemoService.getWalletAddress(userId);
    const vaId = demoVaId(config.currency);
    const depositFee = {
      developerFeePercent: DEMO_ONRAMP_FEE_PERCENT,
      feeCurrency: config.currency,
    };

    return {
      bridgeVirtualAccountId: vaId,
      status: 'activated',
      sourceCurrency: config.currency,
      destinationRail: 'base',
      destinationCurrency: 'usdc',
      destinationAddress,
      developerFeePercent: DEMO_ONRAMP_FEE_PERCENT,
      depositFee,
      minDeposit: resolveOnRampMinDeposit(config.currency, DEMO_ONRAMP_FEE_PERCENT),
      depositInstructions: {
        payment_rail: config.primaryRail,
        payment_rails: config.paymentRails,
        currency: config.currency,
        deposit_message: `KURA-DEMO-${vaId}`,
        ...config.depositInstructions,
      },
      createdAt: DemoService.demoDaysAgoIso(14),
    };
  }

  static async bridgeVirtualAccounts(userId: string): Promise<VirtualAccountResult[]> {
    return Promise.all(
      DEMO_ONRAMP_CURRENCIES.map((currency) => DemoService.bridgeVirtualAccount(userId, currency)),
    );
  }

  static bridgeDeposits(): DepositResult[] {
    const deposits: DepositResult[] = [];

    for (const [index, currency] of DEMO_ONRAMP_CURRENCIES.entries()) {
      const vaId = demoVaId(currency);
      const completedAt = DemoService.demoDaysAgoIso(5 - index);
      const sampleAmounts: Record<DemoOnrampCurrency, string> = {
        usd: '500.00',
        eur: '420.00',
        gbp: '380.00',
        mxn: '8500.00',
        brl: '2500.00',
        cop: '1800000.00',
      };
      const amount = sampleAmounts[currency];
      const payer = demoDepositPayer(currency);

      deposits.push({
        depositId: `demo-deposit-${currency}-completed`,
        bridgeVirtualAccountId: vaId,
        status: 'payment_processed',
        completed: true,
        amount,
        currency,
        netAmount: amount,
        developerFeeAmount: '0.00',
        exchangeFeeAmount: '0.00',
        gasFee: '0.00',
        destinationTxHash: `0xdemoBridgeDeposit${currency}TxHash000001`,
        createdAt: completedAt,
        updatedAt: completedAt,
        ...payer,
        events: [
          {
            type: 'funds_received',
            amount,
            currency,
            subtotalAmount: null,
            developerFeeAmount: null,
            exchangeFeeAmount: null,
            gasFee: null,
            destinationTxHash: null,
            occurredAt: completedAt,
            ...payer,
          },
          {
            type: 'payment_processed',
            amount,
            currency,
            subtotalAmount: amount,
            developerFeeAmount: '0.00',
            exchangeFeeAmount: '0.00',
            gasFee: '0.00',
            destinationTxHash: `0xdemoBridgeDeposit${currency}TxHash000001`,
            occurredAt: completedAt,
            ...EMPTY_DEPOSIT_PAYER,
          },
        ],
      });
    }

    // Extra in-progress USD deposit for UI coverage.
    const pendingPayer = demoDepositPayer('usd');
    deposits.unshift({
      depositId: 'demo-deposit-usd-pending',
      bridgeVirtualAccountId: demoVaId('usd'),
      status: 'funds_received',
      completed: false,
      amount: '200.00',
      currency: 'usd',
      netAmount: null,
      developerFeeAmount: null,
      exchangeFeeAmount: null,
      gasFee: null,
      destinationTxHash: null,
      createdAt: DemoService.demoDaysAgoIso(1),
      updatedAt: DemoService.demoDaysAgoIso(1),
      ...pendingPayer,
      events: [
        {
          type: 'funds_received',
          amount: '200.00',
          currency: 'usd',
          subtotalAmount: null,
          developerFeeAmount: null,
          exchangeFeeAmount: null,
          gasFee: null,
          destinationTxHash: null,
          occurredAt: DemoService.demoDaysAgoIso(1),
          ...pendingPayer,
        },
      ],
    });

    return deposits;
  }

  static bridgeDemoTransferIds(): string[] {
    return DEMO_ONRAMP_CURRENCIES.map((currency) => `demo-transfer-onramp-${currency}`);
  }

  static async bridgeTransfers(userId: string): Promise<TransferResult[]> {
    const samples: Array<{ currency: DemoOnrampCurrency; amount: string; rail: string }> = [
      { currency: 'usd', amount: '500.00', rail: 'ach_push' },
      { currency: 'eur', amount: '420.00', rail: 'sepa' },
      { currency: 'gbp', amount: '380.00', rail: 'faster_payments' },
      { currency: 'mxn', amount: '8500.00', rail: 'spei' },
      { currency: 'brl', amount: '2500.00', rail: 'pix' },
      { currency: 'cop', amount: '1800000.00', rail: 'pse' },
    ];
    return Promise.all(
      samples.map((s) =>
        DemoService.bridgeTransfer(
          userId,
          `demo-transfer-onramp-${s.currency}`,
          s.currency,
          s.amount,
          s.rail,
        ),
      ),
    );
  }

  static async bridgeTransfer(
    userId: string,
    bridgeTransferId: string,
    sourceCurrency = 'usd',
    amount = '500.00',
    sourceRail = 'ach_push',
  ): Promise<TransferResult> {
    const config = demoOnrampConfig(sourceCurrency);
    const vaId = demoVaId(config.currency);
    const destinationAddress = await DemoService.getWalletAddress(userId);

    return {
      bridgeTransferId,
      direction: 'onramp',
      state: 'payment_processed',
      amount,
      sourceRail,
      sourceCurrency: config.currency,
      destinationRail: 'base',
      destinationCurrency: 'usdc',
      destinationAddress,
      destinationExternalId: null,
      depositInstructions: {
        payment_rail: config.primaryRail,
        payment_rails: config.paymentRails,
        currency: config.currency,
        bank_name: config.bankName,
        deposit_message: `KURA-DEMO-${vaId}`,
        ...config.depositInstructions,
      },
      createdAt: DemoService.demoDaysAgoIso(3),
    };
  }

  static bridgeExternalAccounts(): ExternalAccountResult[] {
    return DEMO_EXTERNAL_ACCOUNT_CONFIGS.map((c) => DemoService.bridgeExternalAccount(c.currency));
  }

  static bridgeExternalAccount(currency = 'usd'): ExternalAccountResult {
    const config = demoExternalConfig(currency);
    return {
      bridgeExternalAccountId: config.bridgeExternalAccountId,
      bankName: config.bankName,
      accountOwnerName: config.accountOwnerName,
      last4: config.last4,
      currency: config.currency,
      active: true,
    };
  }

  static bridgeExternalAccountFromBody(body: Record<string, unknown>): ExternalAccountResult {
    const currency =
      typeof body.currency === 'string' ? body.currency : 'usd';
    return DemoService.bridgeExternalAccount(currency);
  }

  static bridgeDeletedExternalAccount(currency = 'usd'): ExternalAccountResult {
    return {
      ...DemoService.bridgeExternalAccount(currency),
      active: false,
    };
  }

  static async bridgeLiquidationAddress(userId: string): Promise<LiquidationAddressResult> {
    const pair = LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC;
    const destinationAddress = await DemoService.getWalletAddress(userId);
    const depositFee = {
      developerFeePercent: DEMO_CRYPTO_FEE_PERCENT,
      feeCurrency: 'usdt',
    };

    return {
      bridgeLiquidationAddressId: DEMO_LIQUIDATION_ADDRESS_ID,
      state: 'active',
      sourceChain: pair.sourceChain,
      sourceCurrency: pair.sourceCurrency,
      destinationRail: pair.destinationRail,
      destinationCurrency: pair.destinationCurrency,
      destinationAddress,
      depositAddress: DEMO_TRON_DEPOSIT_ADDRESS,
      blockchainMemo: 'KURA-DEMO-TRON',
      developerFeePercent: DEMO_CRYPTO_FEE_PERCENT,
      depositFee,
      minDeposit: resolveTronUsdtMinDeposit(DEMO_CRYPTO_FEE_PERCENT),
      createdAt: DemoService.demoDaysAgoIso(10),
    };
  }

  static async bridgeLiquidationAddresses(userId: string): Promise<LiquidationAddressResult[]> {
    return [await DemoService.bridgeLiquidationAddress(userId)];
  }

  static async bridgePayoutAddress(
    userId: string,
    params: CreatePayoutAddressParams = {
      destinationRail: 'ach_same_day',
      destinationCurrency: 'usd',
      externalAccountId: demoExternalConfig('usd').bridgeExternalAccountId,
    },
  ): Promise<PayoutLiquidationAddressResult> {
    const payoutFee = {
      developerFeePercent: DEMO_PAYOUT_FEE_PERCENT,
      feeCurrency: 'usdc',
    };
    const laId = demoPayoutLaId(params.destinationRail, params.destinationCurrency);

    return {
      bridgeLiquidationAddressId: laId,
      state: 'active',
      sourceChain: 'base',
      sourceCurrency: 'usdc',
      destinationRail: params.destinationRail,
      destinationCurrency: params.destinationCurrency,
      bridgeExternalAccountId: params.externalAccountId,
      depositAddress: `0xDemoBridgePayout${params.destinationCurrency}${params.destinationRail}001`,
      blockchainMemo: null,
      developerFeePercent: DEMO_PAYOUT_FEE_PERCENT,
      payoutFee,
      minDeposit: resolvePayoutMinDeposit(params.destinationRail, DEMO_PAYOUT_FEE_PERCENT),
      createdAt: DemoService.demoDaysAgoIso(7),
    };
  }

  static async bridgePayoutAddresses(userId: string): Promise<PayoutLiquidationAddressResult[]> {
    return Promise.all(
      DEMO_PAYOUT_RAILS.map((rail) =>
        DemoService.bridgePayoutAddress(userId, {
          destinationRail: rail.destinationRail,
          destinationCurrency: rail.destinationCurrency,
          externalAccountId: rail.externalAccountId,
        }),
      ),
    );
  }

  static bridgePayoutDrains(liquidationAddressId: string): PayoutDrainResult[] {
    if (!liquidationAddressId.startsWith('demo-payout-la-')) {
      return [];
    }

    const parts = liquidationAddressId.replace('demo-payout-la-', '').split('-');
    const destinationCurrency = parts[0] ?? 'usd';
    const destinationRail = parts.slice(1).join('_') || 'ach_same_day';
    const externalAccountId = demoExternalConfig(destinationCurrency).bridgeExternalAccountId;

    return [
      {
        bridgeDrainId: `demo-payout-drain-${destinationCurrency}`,
        bridgeLiquidationAddressId: liquidationAddressId,
        state: 'payment_processed',
        amount: '1200.00',
        currency: 'usdc',
        depositTxHash: `0xdemoBridgePayoutDrain${destinationCurrency}Tx001`,
        destination: {
          payment_rail: destinationRail,
          currency: destinationCurrency,
          external_account_id: externalAccountId,
        },
        createdAt: DemoService.demoDaysAgoIso(2),
      },
    ];
  }
}
