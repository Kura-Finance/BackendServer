/**
 * Bridge (api.bridge.xyz) On/Off Ramp 型別定義
 *
 * 命名對應 Bridge API：
 *   - Customer / KYC Link：用戶 onboarding（KYC + TOS）
 *   - Transfer：on-ramp（fiat → crypto）、off-ramp（crypto → fiat）、crypto-to-crypto
 *   - External Account：off-ramp 的法幣出金銀行帳戶
 */

export type BridgeCustomerType = 'individual' | 'business';

export type BridgeTransferDirection = 'onramp' | 'offramp' | 'crypto';

// Bridge endorsement（可在建立 KYC/KYB link 時預先申請所需 rail）
export type BridgeEndorsementType =
  | 'base'
  | 'cards'
  | 'cop'
  | 'faster_payments'
  | 'pix'
  | 'sepa'
  | 'spei';

// 建立 KYC（individual）/ KYB（business）link 的參數
export interface CreateKycLinkParams {
  type: BridgeCustomerType;
  // individual：個人全名；business：公司法定名稱（legal name）
  fullName: string;
  email?: string;
  endorsements?: BridgeEndorsementType[];
  redirectUri?: string;
  // 含非 Latin-1 字元時 Bridge 要求提供羅馬化名稱
  transliteratedFirstName?: string;
  transliteratedMiddleName?: string;
  transliteratedLastName?: string;
  transliteratedBusinessLegalName?: string;
}

// ── Bridge API 原始回應（僅取用到的欄位）──────────────────────────────

export interface BridgeKycLinkResponse {
  id: string;
  full_name?: string;
  email?: string;
  type?: BridgeCustomerType;
  kyc_link?: string;
  tos_link?: string;
  kyc_status?: string;
  tos_status?: string;
  customer_id?: string | null;
  rejection_reasons?: unknown[];
}

export interface BridgeEndorsement {
  name: string; // base | sepa | spei | ...
  status: string; // approved | incomplete | revoked | ...
  requirements?: Record<string, unknown>;
}

export interface BridgeCustomerResponse {
  id: string;
  type?: BridgeCustomerType;
  email?: string;
  status?: string;
  kyc_status?: string;
  tos_status?: string;
  endorsements?: BridgeEndorsement[];
  rejection_reasons?: unknown[];
}

export interface BridgeDepositInstructions {
  payment_rail?: string;
  payment_rails?: string[];
  amount?: string;
  currency?: string;
  from_address?: string;
  to_address?: string;
  deposit_message?: string;
  blockchain_memo?: string;
  bank_name?: string;
  bank_address?: string;
  bank_account_number?: string;
  bank_routing_number?: string;
  bank_beneficiary_name?: string;
  bank_beneficiary_address?: string;
  iban?: string;
  bic?: string;
  [key: string]: unknown;
}

export interface BridgeTransferSource {
  payment_rail?: string;
  currency?: string;
  from_address?: string;
  bridge_wallet_id?: string;
  [key: string]: unknown;
}

export interface BridgeTransferDestination {
  payment_rail?: string;
  currency?: string;
  to_address?: string;
  bridge_wallet_id?: string;
  external_account_id?: string;
  [key: string]: unknown;
}

export interface BridgeTransferReceipt {
  initial_amount?: string;
  subtotal_amount?: string;
  final_amount?: string;
  destination_tx_hash?: string;
  [key: string]: unknown;
}

export interface BridgeTransferResponse {
  id: string;
  state: string;
  amount?: string;
  currency?: string;
  developer_fee?: string;
  client_reference_id?: string | null;
  on_behalf_of?: string;
  source?: BridgeTransferSource;
  destination?: BridgeTransferDestination;
  source_deposit_instructions?: BridgeDepositInstructions;
  receipt?: BridgeTransferReceipt;
  created_at?: string;
  updated_at?: string;
}

export interface BridgeExternalAccountResponse {
  id: string;
  customer_id?: string;
  bank_name?: string;
  account_owner_name?: string;
  last_4?: string;
  currency?: string;
  active?: boolean;
  [key: string]: unknown;
}

// ── Virtual Accounts（持久法幣入金帳戶）─────────────────────────────────

// 單一 rail 的 developer fee 設定（fee_config，Bridge Beta 功能）
export interface BridgeFeeParams {
  fee_amount?: string; // 固定費（以入金法幣計），先扣
  fee_percent?: string; // 百分比（base 100，例如 "0.1" = 0.1%），對扣除固定費後的餘額計算
  minimum_fee?: string;
  maximum_fee?: string;
}

// fee_config：source 端依 payment rail（或 default）設定費用
export interface BridgeFeeConfig {
  source: Record<string, BridgeFeeParams>; // key: 'default' | 'ach_push' | 'wire' | 'sepa' | 'spei' | ...
}

export interface BridgeVirtualAccountResponse {
  id: string;
  status?: string; // activated | deactivated
  developer_fee_percent?: string;
  customer_id?: string;
  source_deposit_instructions?: BridgeDepositInstructions;
  destination?: {
    payment_rail?: string;
    currency?: string;
    address?: string;
    [key: string]: unknown;
  };
  created_at?: string;
}

export interface BridgeVirtualAccountListResponse {
  count?: number;
  data?: BridgeVirtualAccountResponse[];
}

// VA 活動事件（webhook event_object / history item）
export interface BridgeVirtualAccountEventResponse {
  id: string;
  type?: string; // funds_received | payment_submitted | payment_processed | refunded | ...
  amount?: string;
  currency?: string;
  subtotal_amount?: string;
  developer_fee_amount?: string;
  exchange_fee_amount?: string;
  gas_fee?: string;
  deposit_id?: string;
  destination_tx_hash?: string;
  customer_id?: string;
  virtual_account_id?: string;
  source?: Record<string, unknown>;
  created_at?: string;
}

export interface BridgeLiquidationAddressResponse {
  id: string;
  customer_id?: string;
  chain: string;
  currency: string;
  address?: string;
  blockchain_memo?: string;
  destination_payment_rail?: string;
  destination_currency?: string;
  destination_address?: string;
  external_account_id?: string;
  state?: string;
  custom_developer_fee_percent?: string | null;
  return_instructions?: {
    address?: string;
    memo?: string;
  };
  created_at?: string;
  updated_at?: string;
}

export interface BridgeLiquidationAddressListResponse {
  count?: number;
  data?: BridgeLiquidationAddressResponse[];
}

export interface BridgeDrainResponse {
  id: string;
  amount?: string;
  currency?: string;
  state?: string;
  liquidation_address_id?: string;
  deposit_tx_hash?: string;
  destination_tx_hash?: string;
  destination?: Record<string, unknown>;
  receipt?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface BridgeDrainListResponse {
  count?: number;
  data?: BridgeDrainResponse[];
}

/** Base USDC → 法幣銀行（off-ramp LA）固定 source。 */
export const PAYOUT_LIQUIDATION_SOURCE = {
  sourceChain: 'base',
  sourceCurrency: 'usdc',
} as const;

export interface CreatePayoutAddressParams {
  destinationRail: string;
  destinationCurrency: string;
  externalAccountId: string;
  returnAddress?: string;
  destinationReference?: string;
}

export interface PayoutDeveloperFee {
  developerFeePercent: string;
  feeCurrency: string;
}

export interface PayoutLiquidationAddressResult {
  bridgeLiquidationAddressId: string;
  state: string;
  sourceChain: string;
  sourceCurrency: string;
  destinationRail: string;
  destinationCurrency: string;
  bridgeExternalAccountId: string;
  depositAddress: string;
  blockchainMemo: string | null;
  /** @deprecated 請改用 payoutFee.developerFeePercent */
  developerFeePercent: string;
  payoutFee: PayoutDeveloperFee;
  minDeposit: MinDeposit;
  createdAt: string;
}

export interface PayoutDrainResult {
  bridgeDrainId: string;
  bridgeLiquidationAddressId: string;
  state: string;
  amount: string | null;
  currency: string | null;
  depositTxHash: string | null;
  destination: Record<string, unknown> | null;
  createdAt: string | null;
}

// ── 對外（controller → client）回傳型別 ───────────────────────────────

export interface KycLinkResult {
  bridgeCustomerId: string | null;
  kycLinkId: string | null;
  customerType: BridgeCustomerType;
  kycLink: string | null;
  tosLink: string | null;
  kycStatus: string;
  tosStatus: string;
  /** 既有 customer 申請額外 rail endorsement 時回傳（例如 brl→pix、cop→cop）。 */
  requestedEndorsement?: BridgeEndorsementType;
}

export interface EndorsementLinkResult {
  bridgeCustomerId: string;
  endorsement: BridgeEndorsementType;
  kycLink: string;
  /** 由 currency 參數解析時回傳（例如 brl、cop）。 */
  currency?: string;
}

export interface CustomerStatusResult {
  bridgeCustomerId: string | null;
  customerType: BridgeCustomerType;
  kycStatus: string;
  tosStatus: string;
  endorsements: BridgeEndorsement[];
  canTransact: boolean;
}

export interface TransferResult {
  bridgeTransferId: string;
  direction: BridgeTransferDirection;
  state: string;
  amount: string | null;
  sourceRail: string | null;
  sourceCurrency: string | null;
  destinationRail: string | null;
  destinationCurrency: string | null;
  destinationAddress: string | null;
  destinationExternalId: string | null;
  depositInstructions: BridgeDepositInstructions | null;
  createdAt: string;
}

export interface ExternalAccountResult {
  bridgeExternalAccountId: string;
  bankName: string | null;
  accountOwnerName: string | null;
  last4: string | null;
  currency: string;
  active: boolean;
}

/** Pay Out（off-ramp）支援的 payment rail 與對應法幣 / 銀行帳戶類型。 */
export interface PayoutOption {
  rail: string;
  currency: string;
  label: string;
  endorsement: BridgeEndorsementType | 'base';
  accountTypes: Array<'us' | 'iban' | 'clabe' | 'pix' | 'gb'>;
  minDeposit: MinDeposit;
}

export type PayoutOptionBase = Omit<PayoutOption, 'minDeposit'>;

export const PAYOUT_OPTION_BASES: PayoutOptionBase[] = [
  {
    rail: 'ach_same_day',
    currency: 'usd',
    label: 'ACH same day',
    endorsement: 'base',
    accountTypes: ['us'],
  },
  {
    rail: 'wire',
    currency: 'usd',
    label: 'Wire',
    endorsement: 'base',
    accountTypes: ['us'],
  },
  {
    rail: 'faster_payments',
    currency: 'gbp',
    label: 'Faster Payments',
    endorsement: 'faster_payments',
    accountTypes: ['gb'],
  },
  {
    rail: 'pix',
    currency: 'brl',
    label: 'Pix',
    endorsement: 'pix',
    accountTypes: ['pix'],
  },
  {
    rail: 'spei',
    currency: 'mxn',
    label: 'SPEI',
    endorsement: 'spei',
    accountTypes: ['clabe'],
  },
];

// 建立 / 取得入金 Virtual Account 的參數
// 注意：費率（developer fee）不由 client 提供，一律由後端依入金幣別查表套用。
export interface CreateVirtualAccountParams {
  sourceCurrency: string; // usd | eur | mxn
  destinationRail: string; // ethereum | base | polygon | solana ...
  destinationCurrency: string; // usdc | usdb ...
  toAddress?: string; // 未提供時回退到使用者錢包（scaAddress / walletAddress）
}

/** Tron USDT → Base USDC Liquidation Address（收款 SCA 預設為使用者 scaAddress）。 */
export interface CreateLiquidationAddressParams {
  toAddress?: string; // Base USDC 收款地址；省略時使用 scaAddress
  returnAddress?: string; // Tron 退款地址（建議提供，用於失敗退回）
}

export const LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC = {
  sourceChain: 'tron',
  sourceCurrency: 'usdt',
  destinationRail: 'base',
  destinationCurrency: 'usdc',
} as const;

/** @deprecated Use LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC */
export const CRYPTO_TRANSFER_TRON_USDT_TO_BASE_USDC = {
  sourceRail: LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC.sourceChain,
  sourceCurrency: LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC.sourceCurrency,
  destinationRail: LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC.destinationRail,
  destinationCurrency: LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC.destinationCurrency,
} as const;

export interface DepositDeveloperFee {
  /** 平台 developer fee（base 100："0.85" = 入金金額的 0.85%），一律由後端計算。 */
  developerFeePercent: string;
  /** 費率適用的入金幣別（顯示用，例如 usdt / usd）。 */
  feeCurrency: string;
}

/** Bridge 最低入金額（已含 developer fee；使用者須打入此毛額，扣費後淨額仍達 Bridge 門檻）。 */
export interface MinDeposit {
  amount: string;
  currency: string;
}

function ceilMinDepositAmount(n: number): number {
  return Math.ceil(n * 100) / 100;
}

function trimMinDepositDecimal(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** 將 Bridge 淨額門檻換算為含手續費的毛額（向上取兩位小數）。 */
export function grossMinDeposit(
  netAmount: string,
  currency: string,
  developerFeePercent: string,
): MinDeposit {
  const net = Number(netAmount);
  const pct = Number(developerFeePercent);
  const cur = currency.toLowerCase();
  if (!Number.isFinite(net) || net <= 0) {
    return { amount: netAmount, currency: cur };
  }
  if (!Number.isFinite(pct) || pct <= 0) {
    return { amount: trimMinDepositDecimal(net.toFixed(2)), currency: cur };
  }
  const rate = pct / 100;
  if (rate >= 1) {
    return { amount: trimMinDepositDecimal(net.toFixed(2)), currency: cur };
  }
  const gross = ceilMinDepositAmount(net / (1 - rate));
  return { amount: trimMinDepositDecimal(gross.toFixed(2)), currency: cur };
}

// Bridge 法幣 VA on-ramp 淨額門檻（扣 developer fee 後須達標；來源法幣計）。
export const ONRAMP_MIN_DEPOSIT_NET: Record<string, string> = {
  usd: '1',
  gbp: '2',
  eur: '1',
  brl: '10',
  mxn: '50',
};

// Bridge USDC@Base → 法幣 off-ramp 淨額門檻（使用者打入 USDC，扣費後須達標）。
export const PAYOUT_MIN_DEPOSIT_NET_BY_RAIL: Record<string, string> = {
  ach: '1',
  ach_push: '1',
  ach_same_day: '1',
  wire: '1',
  faster_payments: '3',
  pix: '2',
  spei: '2',
  sepa: '1',
};

export const TRON_USDT_MIN_DEPOSIT_NET = '5';

export function resolveOnRampMinDeposit(
  sourceCurrency: string,
  developerFeePercent: string,
): MinDeposit {
  const currency = sourceCurrency.toLowerCase();
  return grossMinDeposit(
    ONRAMP_MIN_DEPOSIT_NET[currency] ?? '1',
    currency,
    developerFeePercent,
  );
}

export function resolvePayoutMinDeposit(
  destinationRail: string,
  developerFeePercent: string,
  sourceCurrency = 'usdc',
): MinDeposit {
  const rail = destinationRail.toLowerCase();
  return grossMinDeposit(
    PAYOUT_MIN_DEPOSIT_NET_BY_RAIL[rail] ?? '1',
    sourceCurrency,
    developerFeePercent,
  );
}

export function resolveTronUsdtMinDeposit(developerFeePercent: string): MinDeposit {
  return grossMinDeposit(TRON_USDT_MIN_DEPOSIT_NET, 'usdt', developerFeePercent);
}

export interface LiquidationAddressResult {
  bridgeLiquidationAddressId: string;
  state: string;
  sourceChain: string;
  sourceCurrency: string;
  destinationRail: string;
  destinationCurrency: string;
  destinationAddress: string;
  depositAddress: string;
  blockchainMemo: string | null;
  /** @deprecated 請改用 depositFee.developerFeePercent */
  developerFeePercent: string;
  depositFee: DepositDeveloperFee;
  minDeposit: MinDeposit;
  createdAt: string;
}

export interface VirtualAccountResult {
  bridgeVirtualAccountId: string;
  status: string; // activated | deactivated
  sourceCurrency: string;
  destinationRail: string;
  destinationCurrency: string;
  destinationAddress: string;
  /** @deprecated 請改用 depositFee.developerFeePercent */
  developerFeePercent: string;
  depositFee: DepositDeveloperFee;
  minDeposit: MinDeposit;
  // 給用戶的法幣入金銀行資訊（持久、免 memo）
  depositInstructions: BridgeDepositInstructions | null;
  createdAt: string;
}

// 單一入金事件（VA activity 帳本中的一筆）
export interface DepositEvent {
  type: string; // funds_received | payment_submitted | payment_processed | refunded | ...
  amount: string | null;
  currency: string | null;
  subtotalAmount: string | null;
  developerFeeAmount: string | null;
  exchangeFeeAmount: string | null;
  gasFee: string | null;
  destinationTxHash: string | null;
  occurredAt: string | null;
}

// 一筆入金（依 depositId 聚合多個事件），供前端輪詢顯示狀態
export interface DepositResult {
  depositId: string | null;
  bridgeVirtualAccountId: string;
  // 最新事件類型，前端可據此顯示狀態（processing / completed / refunded …）
  status: string;
  completed: boolean; // 是否已 payment_processed（穩定幣已到帳）
  amount: string | null; // 入金總額（手續費前）
  currency: string | null;
  netAmount: string | null; // 扣費後實際轉換金額（subtotal）
  developerFeeAmount: string | null;
  exchangeFeeAmount: string | null;
  gasFee: string | null;
  destinationTxHash: string | null;
  createdAt: string; // 最早事件時間
  updatedAt: string; // 最新事件時間
  events: DepositEvent[]; // 完整事件明細（時間升序）
}
