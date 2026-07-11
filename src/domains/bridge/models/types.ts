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
  amount?: string;
  currency?: string;
  from_address?: string;
  to_address?: string;
  deposit_message?: string;
  blockchain_memo?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_routing_number?: string;
  bank_beneficiary_name?: string;
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

// ── 對外（controller → client）回傳型別 ───────────────────────────────

export interface KycLinkResult {
  bridgeCustomerId: string | null;
  kycLinkId: string | null;
  kycLink: string | null;
  tosLink: string | null;
  kycStatus: string;
  tosStatus: string;
}

export interface CustomerStatusResult {
  bridgeCustomerId: string | null;
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
