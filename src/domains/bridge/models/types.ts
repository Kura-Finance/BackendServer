/**
 * Bridge (api.bridge.xyz) on/off-ramp type definitions.
 *
 * Names mirror the Bridge API:
 *   - Customer / KYC Link: user onboarding (KYC + TOS)
 *   - Transfer: on-ramp (fiat → crypto), off-ramp (crypto → fiat), crypto-to-crypto
 *   - External Account: off-ramp fiat payout bank account
 */

export type BridgeCustomerType = 'individual' | 'business';

export type BridgeTransferDirection = 'onramp' | 'offramp' | 'crypto';

// Bridge endorsement (can pre-request rails when creating KYC/KYB link)
export type BridgeEndorsementType =
  | 'base'
  | 'cards'
  | 'cop'
  | 'faster_payments'
  | 'pix'
  | 'sepa'
  | 'spei';

// Params to create a KYC (individual) / KYB (business) link
export interface CreateKycLinkParams {
  type: BridgeCustomerType;
  // individual: full personal name; business: company legal name
  fullName: string;
  email?: string;
  endorsements?: BridgeEndorsementType[];
  redirectUri?: string;
  // Bridge requires romanized names when non-Latin-1 characters are present
  transliteratedFirstName?: string;
  transliteratedMiddleName?: string;
  transliteratedLastName?: string;
  transliteratedBusinessLegalName?: string;
}

// ── Bridge API raw responses (fields we use) ────────────────────────

export interface BridgeRejectionReason {
  developer_reason?: string;
  reason?: string;
  created_at?: string | null;
}

/** Customer-facing rejection/pause reasons (reason only; no developer_reason). */
export interface BridgeRejectionReasonPublic {
  reason: string;
  createdAt: string | null;
}

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
  rejection_reasons?: BridgeRejectionReason[];
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
  rejection_reasons?: BridgeRejectionReason[];
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

/** Bridge fiat payout identity: who appears as sender on off-ramp payouts. */
export type BridgeFiatPayoutName = 'bridge' | 'developer' | 'payment_provider' | 'customer';

/** PATCH/GET /customers/{id}/fiat_payout_configuration — currency → rail → payout name. */
export type BridgeFiatPayoutConfiguration = Record<string, Record<string, BridgeFiatPayoutName>>;

/**
 * Customer-named payout rails we enable automatically after KYC approval.
 * @see https://apidocs.bridge.xyz/platform/orchestration/more/fiat-payout-configuration
 * Currently only usd.wire supports `customer` (premium; contact Bridge to enable).
 */
export const CUSTOMER_NAMED_PAYOUT_CONFIGURATION: BridgeFiatPayoutConfiguration = {
  usd: { wire: 'customer' },
};

// ── Virtual Accounts (persistent fiat deposit accounts) ─────────────

// Per-rail developer fee settings (fee_config; Bridge Beta)
export interface BridgeFeeParams {
  fee_amount?: string; // Fixed fee in deposit fiat; deducted first
  fee_percent?: string; // Percent (base 100, e.g. "0.1" = 0.1%) on remainder after fixed fee
  minimum_fee?: string;
  maximum_fee?: string;
}

// fee_config: source-side fees by payment rail (or default)
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

// VA activity event (webhook event_object / history item)
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

export interface BridgeVirtualAccountHistoryResponse {
  count?: number;
  data?: BridgeVirtualAccountEventResponse[];
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

/** Fixed source for Base USDC → fiat bank (off-ramp LA). */
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
  /** @deprecated Prefer payoutFee.developerFeePercent */
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

// ── Public response types (controller → client) ─────────────────────

export interface KycLinkResult {
  bridgeCustomerId: string | null;
  kycLinkId: string | null;
  customerType: BridgeCustomerType;
  kycLink: string | null;
  tosLink: string | null;
  kycStatus: string;
  tosStatus: string;
  /** Returned when an existing customer requests an extra rail endorsement (e.g. brl→pix). */
  requestedEndorsement?: BridgeEndorsementType;
}

export interface EndorsementLinkResult {
  bridgeCustomerId: string;
  endorsement: BridgeEndorsementType;
  kycLink: string;
  /** Returned when resolved from a currency param (e.g. brl, cop). */
  currency?: string;
}

export interface CustomerStatusResult {
  bridgeCustomerId: string | null;
  customerType: BridgeCustomerType;
  kycStatus: string;
  tosStatus: string;
  endorsements: BridgeEndorsement[];
  canTransact: boolean;
  /** Whether customer-named fiat payout is configured on Bridge (USD wire only today). */
  customerNamedPayoutConfigured: boolean;
  /**
   * Customer-readable reasons for rejected/paused (from Bridge rejection_reasons.reason).
   * Excludes developer_reason.
   */
  rejectionReasons: BridgeRejectionReasonPublic[];
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

/** Supported Pay Out (off-ramp) payment rails with fiat / bank account types. */
export interface PayoutOption {
  rail: string;
  currency: string;
  label: string;
  endorsement: BridgeEndorsementType | 'base';
  accountTypes: Array<'us' | 'iban' | 'clabe' | 'pix' | 'gb' | 'cop'>;
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
    rail: 'sepa',
    currency: 'eur',
    label: 'SEPA',
    endorsement: 'sepa',
    accountTypes: ['iban'],
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
  {
    rail: 'bre_b',
    currency: 'cop',
    label: 'Bre-B',
    endorsement: 'cop',
    accountTypes: ['cop'],
  },
  {
    rail: 'co_bank_transfer',
    currency: 'cop',
    label: 'Bank Transfer (COP)',
    endorsement: 'cop',
    accountTypes: ['cop'],
  },
];

// Params to get/create a deposit Virtual Account.
// Developer fee is never client-supplied; backend applies by deposit currency.
export interface CreateVirtualAccountParams {
  sourceCurrency: string; // usd | eur | mxn
  destinationRail: string; // ethereum | base | polygon | solana ...
  destinationCurrency: string; // usdc | usdb ...
  toAddress?: string; // Falls back to user wallet (scaAddress / walletAddress) if omitted
}

/** Tron USDT → Base USDC Liquidation Address (default dest SCA = user scaAddress). */
export interface CreateLiquidationAddressParams {
  toAddress?: string; // Base USDC receive address; defaults to scaAddress
  returnAddress?: string; // Tron refund address (recommended for failed returns)
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
  /** Platform developer fee (base 100: "0.85" = 0.85% of deposit); always server-computed. */
  developerFeePercent: string;
  /** Deposit currency the fee applies to (display; e.g. usdt / usd). */
  feeCurrency: string;
}

/** Bridge min deposit including developer fee (gross; net after fee must still meet Bridge floor). */
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

/** Convert Bridge net threshold to gross including fee (ceil 2dp). */
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

// Bridge fiat VA on-ramp net threshold (after developer fee; in source fiat).
export const ONRAMP_MIN_DEPOSIT_NET: Record<string, string> = {
  usd: '1',
  gbp: '2',
  eur: '1',
  brl: '10',
  mxn: '50',
};

// Bridge USDC@Base → fiat off-ramp net threshold (user sends USDC; net after fee).
export const PAYOUT_MIN_DEPOSIT_NET_BY_RAIL: Record<string, string> = {
  ach: '1',
  ach_push: '1',
  ach_same_day: '1',
  wire: '1',
  faster_payments: '3',
  pix: '2',
  spei: '2',
  sepa: '1',
  bre_b: '2',
  co_bank_transfer: '2',
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
  /** @deprecated Prefer depositFee.developerFeePercent */
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
  /** @deprecated Prefer depositFee.developerFeePercent */
  developerFeePercent: string;
  depositFee: DepositDeveloperFee;
  minDeposit: MinDeposit;
  // Fiat deposit bank details for the user (persistent; no memo)
  depositInstructions: BridgeDepositInstructions | null;
  createdAt: string;
}

// Single deposit event (one row in VA activity ledger)
export interface DepositPayerInfo {
  paymentRail: string | null;
  senderName: string | null;
  accountLast4: string | null;
  senderBankRoutingNumber: string | null;
  senderDescription: string | null;
}

/** Normalize Bridge VA event `source` into payer fields for API responses. */
export function parseDepositPayerSource(
  source: Record<string, unknown> | null | undefined,
): DepositPayerInfo | null {
  if (!source || typeof source !== 'object') return null;

  const str = (key: string): string | null => {
    const value = source[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  const paymentRail = str('payment_rail');
  const senderName = str('sender_name');
  const accountLast4 = str('last_4') ?? str('iban_last_4');
  const senderBankRoutingNumber =
    str('sender_bank_routing_number') ??
    str('sender_routing_number') ??
    str('bank_routing_number');
  const senderDescription = str('description');

  if (
    !paymentRail &&
    !senderName &&
    !accountLast4 &&
    !senderBankRoutingNumber &&
    !senderDescription
  ) {
    return null;
  }

  return {
    paymentRail,
    senderName,
    accountLast4,
    senderBankRoutingNumber,
    senderDescription,
  };
}

export const EMPTY_DEPOSIT_PAYER: DepositPayerInfo = {
  paymentRail: null,
  senderName: null,
  accountLast4: null,
  senderBankRoutingNumber: null,
  senderDescription: null,
};

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
  paymentRail: string | null;
  senderName: string | null;
  accountLast4: string | null;
  senderBankRoutingNumber: string | null;
  senderDescription: string | null;
}

// One deposit (events aggregated by depositId) for client status polling
export interface DepositResult {
  depositId: string | null;
  bridgeVirtualAccountId: string;
  // Latest event type for client status (processing / completed / refunded …)
  status: string;
  completed: boolean; // true once payment_processed (stablecoin credited)
  amount: string | null; // Gross deposit before fees
  currency: string | null;
  netAmount: string | null; // Converted amount after fees (subtotal)
  developerFeeAmount: string | null;
  exchangeFeeAmount: string | null;
  gasFee: string | null;
  destinationTxHash: string | null;
  createdAt: string; // Earliest event time
  updatedAt: string; // Latest event time
  paymentRail: string | null;
  senderName: string | null;
  accountLast4: string | null;
  senderBankRoutingNumber: string | null;
  senderDescription: string | null;
  events: DepositEvent[]; // Full event detail (ascending by time)
}

// ── Funds Requests (bank / fraud recalls) ─────────────────────────────

export interface BridgeFundsRequestResponse {
  id: string;
  deposit_id: string;
  customer_id?: string;
  amount?: string;
  currency?: string;
  payment_rail?: string;
  fraud?: boolean;
  notice_date?: string; // YYYY-MM-DD
  deposit_created_at?: string;
  created_at?: string;
  imad?: string;
  trace_number?: string;
  bank_transaction_id?: string;
  [key: string]: unknown;
}

export interface BridgeFundsRequestListResponse {
  count?: number;
  data?: BridgeFundsRequestResponse[];
}

export type BridgeFundsRequestStatus =
  | 'open'
  | 'return_initiated'
  | 'returned'
  | 'failed'
  | 'ignored';

export interface FundsRequestListItem {
  id: string;
  bridgeFundsRequestId: string;
  depositId: string;
  bridgeCustomerId: string | null;
  userId: string | null;
  fraud: boolean;
  amount: string | null;
  currency: string | null;
  paymentRail: string | null;
  noticeCreatedAt: string | null;
  depositCreatedAt: string | null;
  status: BridgeFundsRequestStatus;
  returnTransferId: string | null;
  returnError: string | null;
  paymentProcessed: boolean;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FundsRequestsSyncExecuted {
  skipped: false;
  upserted: number;
  totalFromBridge: number;
  /** New fraud alerts that triggered pause + platform suspend during this sync. */
  fraudAlertsHandled: number;
  lastSyncedAt: string;
}

export interface FiatDepositReturnResult {
  id: string;
  bridgeFundsRequestId: string;
  depositId: string;
  status: BridgeFundsRequestStatus;
  returnTransferId: string;
  transferState: string | null;
}

export interface BridgeFraudRateBucket {
  fraudCount: number;
  fraudVolumeUsd: number;
  depositCount: number;
  depositVolumeUsd: number;
  countRate: number;
  volumeRate: number;
  countRateBps: number;
  volumeRateBps: number;
  exceedsPenaltyBox: boolean;
  exceedsCritical: boolean;
}

/** Monthly fraud rate for Penalty Box monitoring (US deposit-month / EUR recall-month). */
export interface BridgeFraudRateMonthSummary {
  month: string;
  periodFrom: string;
  periodTo: string;
  penaltyBoxThresholdBps: number;
  criticalThresholdBps: number;
  us: BridgeFraudRateBucket;
  eur: BridgeFraudRateBucket;
  other: BridgeFraudRateBucket;
  combined: BridgeFraudRateBucket;
  openFraudAlerts: number;
  inPenaltyBoxRisk: boolean;
  inCriticalRisk: boolean;
}

export interface FraudRemediateResult {
  pause: {
    bridgeCustomerId: string | null;
    userId: string | null;
    bridgePaused: boolean;
    platformSuspended: boolean;
    alreadyPaused: boolean;
    alreadySuspended: boolean;
  };
  returnResult: FiatDepositReturnResult | null;
  returnError: string | null;
}
