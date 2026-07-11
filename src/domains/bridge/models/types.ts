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

// ── 對外（controller → client）回傳型別 ───────────────────────────────

export interface KycLinkResult {
  bridgeCustomerId: string | null;
  kycLinkId: string | null;
  customerType: BridgeCustomerType;
  kycLink: string | null;
  tosLink: string | null;
  kycStatus: string;
  tosStatus: string;
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

// 建立 / 取得入金 Virtual Account 的參數
// 注意：費率（developer fee）不由 client 提供，一律由後端依入金幣別查表套用。
export interface CreateVirtualAccountParams {
  sourceCurrency: string; // usd | eur | mxn
  destinationRail: string; // ethereum | base | polygon | solana ...
  destinationCurrency: string; // usdc | usdb ...
  toAddress?: string; // 未提供時回退到使用者錢包（scaAddress / walletAddress）
}

export interface VirtualAccountResult {
  bridgeVirtualAccountId: string;
  status: string; // activated | deactivated
  sourceCurrency: string;
  destinationRail: string;
  destinationCurrency: string;
  destinationAddress: string;
  developerFeePercent: string | null;
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
